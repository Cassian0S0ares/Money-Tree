import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, limparBanco, sqlAdmin } from './helpers'
import { criarConta, listarContasComSaldo } from '../../src/data/accounts'
import { criarCategoria } from '../../src/data/categories'
import {
  apagarLancamentoPrevisto,
  atualizarStatus,
  criarLancamento,
  criarTransferencia,
  estornarLancamento,
  listarLancamentos,
} from '../../src/data/transactions'
import { isoDate } from '../../src/domain/dates'
import { cents } from '../../src/domain/money'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

async function cenario() {
  const usuario = await criarUsuario()
  const corrente = await criarConta(usuario, {
    name: 'Corrente',
    type: 'corrente',
    initialBalanceCents: cents(100_000),
    initialBalanceDate: isoDate('2026-09-01'),
  })
  const poupanca = await criarConta(usuario, {
    name: 'Poupança',
    type: 'poupanca',
    initialBalanceCents: cents(0),
    initialBalanceDate: isoDate('2026-09-01'),
  })
  const categoria = await criarCategoria(usuario, { name: 'Mercado', kind: 'despesa' })
  return { usuario, corrente, poupanca, categoria }
}

const despesaBase = {
  kind: 'despesa' as const,
  nature: 'variavel' as const,
  description: 'Compra no mercado',
  amountCents: cents(5_000),
  status: 'liquidado' as const,
  competenceDate: isoDate('2026-09-18'),
  settledDate: isoDate('2026-09-18'),
}

describe('criarLancamento', () => {
  it('grava despesa e reduz o saldo', async () => {
    const { usuario, corrente, categoria } = await cenario()

    const lancamento = await criarLancamento(usuario, {
      ...despesaBase,
      accountId: corrente.id,
      categoryId: categoria.id,
    })

    expect(lancamento.direction).toBe(-1)
    expect(lancamento.signedAmountCents).toBe(-5_000)

    const [conta] = await listarContasComSaldo(usuario)
    expect(conta.balanceCents).toBe(95_000)
  })

  it('previsto não mexe no saldo', async () => {
    const { usuario, corrente, categoria } = await cenario()

    await criarLancamento(usuario, {
      ...despesaBase,
      status: 'previsto',
      settledDate: null,
      accountId: corrente.id,
      categoryId: categoria.id,
    })

    const contas = await listarContasComSaldo(usuario)
    expect(contas.find((c) => c.id === corrente.id)?.balanceCents).toBe(100_000)
  })

  it('rejeita antes de tocar no banco quando a invariante do domínio falha', async () => {
    const { usuario, corrente, categoria } = await cenario()

    await expect(
      criarLancamento(usuario, {
        ...despesaBase,
        amountCents: cents(-1),
        accountId: corrente.id,
        categoryId: categoria.id,
      }),
    ).rejects.toThrow(/positivo/i)
  })
})

describe('listarLancamentos', () => {
  it('filtra por conta, período e status, e devolve o total', async () => {
    const { usuario, corrente, poupanca, categoria } = await cenario()

    await criarLancamento(usuario, { ...despesaBase, accountId: corrente.id, categoryId: categoria.id })
    await criarLancamento(usuario, {
      ...despesaBase,
      description: 'Outra',
      competenceDate: isoDate('2026-08-10'),
      settledDate: isoDate('2026-08-10'),
      accountId: corrente.id,
      categoryId: categoria.id,
    })
    await criarLancamento(usuario, {
      ...despesaBase,
      description: 'Na poupança',
      accountId: poupanca.id,
      categoryId: categoria.id,
    })

    const setembroCorrente = await listarLancamentos(usuario, {
      accountId: corrente.id,
      de: isoDate('2026-09-01'),
      ate: isoDate('2026-09-30'),
    })

    expect(setembroCorrente.total).toBe(1)
    expect(setembroCorrente.itens[0].description).toBe('Compra no mercado')
  })

  it('pagina sem perder a contagem total', async () => {
    const { usuario, corrente, categoria } = await cenario()

    for (let i = 0; i < 5; i++) {
      await criarLancamento(usuario, {
        ...despesaBase,
        description: `Compra ${i}`,
        accountId: corrente.id,
        categoryId: categoria.id,
      })
    }

    const pagina = await listarLancamentos(usuario, { limite: 2, deslocamento: 0 })
    expect(pagina.itens).toHaveLength(2)
    expect(pagina.total).toBe(5)
  })
})

describe('transferência', () => {
  it('cria dois lados e não altera o total', async () => {
    const { usuario, corrente, poupanca } = await cenario()

    const totalAntes = (await listarContasComSaldo(usuario)).reduce(
      (soma, c) => soma + c.balanceCents,
      0,
    )

    await criarTransferencia(usuario, {
      fromAccountId: corrente.id,
      toAccountId: poupanca.id,
      amountCents: cents(30_000),
      description: 'Guardando',
      competenceDate: isoDate('2026-09-18'),
      settledDate: isoDate('2026-09-18'),
      status: 'liquidado',
    })

    const contas = await listarContasComSaldo(usuario)
    expect(contas.reduce((soma, c) => soma + c.balanceCents, 0)).toBe(totalAntes)
    expect(contas.find((c) => c.id === corrente.id)?.balanceCents).toBe(70_000)
    expect(contas.find((c) => c.id === poupanca.id)?.balanceCents).toBe(30_000)
  })
})

describe('estorno e exclusão', () => {
  it('estorno marca o original e cria a linha oposta', async () => {
    const { usuario, corrente, categoria } = await cenario()
    const original = await criarLancamento(usuario, {
      ...despesaBase,
      accountId: corrente.id,
      categoryId: categoria.id,
    })

    const estorno = await estornarLancamento(usuario, original.id, 'valor digitado errado')

    expect(estorno.direction).toBe(1)
    expect(estorno.kind).toBe('ajuste')

    const [conta] = await listarContasComSaldo(usuario)
    expect(conta.balanceCents).toBe(100_000)

    const { itens } = await listarLancamentos(usuario, {})
    expect(itens.find((i) => i.id === original.id)?.status).toBe('estornado')
  })

  it('estornar duas vezes é rejeitado', async () => {
    const { usuario, corrente, categoria } = await cenario()
    const original = await criarLancamento(usuario, {
      ...despesaBase,
      accountId: corrente.id,
      categoryId: categoria.id,
    })

    await estornarLancamento(usuario, original.id, 'primeira vez')
    await expect(estornarLancamento(usuario, original.id, 'segunda')).rejects.toThrow()
  })

  it('desfazer apaga previsto e recusa liquidado', async () => {
    const { usuario, corrente, categoria } = await cenario()

    const previsto = await criarLancamento(usuario, {
      ...despesaBase,
      status: 'previsto',
      settledDate: null,
      accountId: corrente.id,
      categoryId: categoria.id,
    })
    await apagarLancamentoPrevisto(usuario, previsto.id)

    const liquidado = await criarLancamento(usuario, {
      ...despesaBase,
      accountId: corrente.id,
      categoryId: categoria.id,
    })
    await expect(apagarLancamentoPrevisto(usuario, liquidado.id)).rejects.toThrow(/estorno/i)
  })

  it('atualizarStatus respeita a máquina de estados', async () => {
    const { usuario, corrente, categoria } = await cenario()
    const liquidado = await criarLancamento(usuario, {
      ...despesaBase,
      accountId: corrente.id,
      categoryId: categoria.id,
    })

    await expect(atualizarStatus(usuario, liquidado.id, 'cancelado', null)).rejects.toThrow(
      /Transição proibida/,
    )

    const conciliado = await atualizarStatus(
      usuario,
      liquidado.id,
      'conciliado',
      isoDate('2026-09-18'),
    )
    expect(conciliado.status).toBe('conciliado')
  })
})
