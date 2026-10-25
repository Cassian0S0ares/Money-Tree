import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, limparBanco, sqlAdmin } from './helpers'
import { criarConta, listarContasComSaldo } from '../../src/data/accounts'
import { criarCategoria } from '../../src/data/categories'
import {
  apagarLancamentoPrevisto,
  buscarLancamento,
  criarLancamento,
  criarTransferencia,
  estornarLancamento,
} from '../../src/data/transactions'
import { isoDate } from '../../src/domain/dates'
import { cents, parseBRL } from '../../src/domain/money'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

async function cenario() {
  const usuario = await criarUsuario()
  const corrente = await criarConta(usuario, {
    name: 'Corrente', type: 'corrente',
    initialBalanceCents: cents(200_000), initialBalanceDate: isoDate('2026-09-01'),
  })
  const poupanca = await criarConta(usuario, {
    name: 'Poupança', type: 'poupanca',
    initialBalanceCents: cents(0), initialBalanceDate: isoDate('2026-09-01'),
  })
  const categoria = await criarCategoria(usuario, { name: 'Mercado', kind: 'despesa' })
  return { usuario, corrente, poupanca, categoria }
}

describe('registrar lançamento', () => {
  it('valor digitado em pt-BR vira centavos', async () => {
    const { usuario, corrente, categoria } = await cenario()

    const lancamento = await criarLancamento(usuario, {
      accountId: corrente.id, categoryId: categoria.id,
      kind: 'despesa', nature: 'variavel', description: 'Feira',
      amountCents: parseBRL('1.234,56'),
      status: 'liquidado',
      competenceDate: isoDate('2026-09-18'), settledDate: isoDate('2026-09-18'),
    })

    expect(lancamento.amountCents).toBe(123_456)
  })

  it('transferência move entre contas sem virar despesa', async () => {
    const { usuario, corrente, poupanca } = await cenario()

    await criarTransferencia(usuario, {
      fromAccountId: corrente.id, toAccountId: poupanca.id,
      amountCents: cents(50_000), description: 'Reserva',
      competenceDate: isoDate('2026-09-18'), settledDate: isoDate('2026-09-18'),
      status: 'liquidado',
    })

    const contas = await listarContasComSaldo(usuario)
    expect(contas.find((c) => c.name === 'Corrente')?.balanceCents).toBe(150_000)
    expect(contas.find((c) => c.name === 'Poupança')?.balanceCents).toBe(50_000)

    const { listarLancamentos } = await import('../../src/data/transactions')
    const { itens } = await listarLancamentos(usuario, {})
    expect(itens.every((i) => i.kind === 'transferencia')).toBe(true)
    expect(itens.every((i) => i.categoryId === null)).toBe(true)
  })
})

describe('desfazer', () => {
  it('apaga o previsto recém-criado', async () => {
    const { usuario, corrente, categoria } = await cenario()

    const lancamento = await criarLancamento(usuario, {
      accountId: corrente.id, categoryId: categoria.id,
      kind: 'despesa', nature: 'variavel', description: 'Engano',
      amountCents: cents(1000), status: 'previsto',
      competenceDate: isoDate('2026-09-18'), settledDate: null,
    })

    await apagarLancamentoPrevisto(usuario, lancamento.id)
    expect(await buscarLancamento(usuario, lancamento.id)).toBeNull()
  })

  it('não apaga o liquidado — sobra estornar', async () => {
    const { usuario, corrente, categoria } = await cenario()

    const lancamento = await criarLancamento(usuario, {
      accountId: corrente.id, categoryId: categoria.id,
      kind: 'despesa', nature: 'variavel', description: 'Pago',
      amountCents: cents(1000), status: 'liquidado',
      competenceDate: isoDate('2026-09-18'), settledDate: isoDate('2026-09-18'),
    })

    await expect(apagarLancamentoPrevisto(usuario, lancamento.id)).rejects.toThrow(/estorno/i)
    expect(await buscarLancamento(usuario, lancamento.id)).not.toBeNull()
  })
})

describe('estornar', () => {
  it('devolve o saldo e deixa os dois registros visíveis', async () => {
    const { usuario, corrente, categoria } = await cenario()

    const original = await criarLancamento(usuario, {
      accountId: corrente.id, categoryId: categoria.id,
      kind: 'despesa', nature: 'variavel', description: 'Valor errado',
      amountCents: cents(99_900), status: 'liquidado',
      competenceDate: isoDate('2026-09-18'), settledDate: isoDate('2026-09-18'),
    })

    await estornarLancamento(usuario, original.id, 'digitei 999 em vez de 99')

    const [conta] = await listarContasComSaldo(usuario)
    expect(conta.balanceCents).toBe(200_000)

    const { listarLancamentos } = await import('../../src/data/transactions')
    const { itens } = await listarLancamentos(usuario, {})
    expect(itens).toHaveLength(2)
    expect(itens.some((i) => i.status === 'estornado')).toBe(true)
  })

  it('exige motivo', async () => {
    const { usuario, corrente, categoria } = await cenario()
    const original = await criarLancamento(usuario, {
      accountId: corrente.id, categoryId: categoria.id,
      kind: 'despesa', nature: 'variavel', description: 'X',
      amountCents: cents(1000), status: 'liquidado',
      competenceDate: isoDate('2026-09-18'), settledDate: isoDate('2026-09-18'),
    })

    await expect(estornarLancamento(usuario, original.id, '   ')).rejects.toThrow(/motivo/i)
  })
})

describe('estornar transferência', () => {
  it('estorna os dois lados juntos, partindo de qualquer um deles', async () => {
    const { usuario, corrente, poupanca } = await cenario()

    await criarTransferencia(usuario, {
      fromAccountId: corrente.id, toAccountId: poupanca.id,
      amountCents: cents(50_000), description: 'Reserva',
      competenceDate: isoDate('2026-09-18'), settledDate: isoDate('2026-09-18'),
      status: 'liquidado',
    })

    const { listarLancamentos } = await import('../../src/data/transactions')
    const { itens } = await listarLancamentos(usuario, {})
    const destino = itens.find((i) => i.accountId === poupanca.id)!

    await estornarLancamento(usuario, destino.id, 'transferi para a conta errada')

    // Estornar só um lado deixaria a corrente sem os 500 e a poupança zerada:
    // dinheiro sumindo do total.
    const contas = await listarContasComSaldo(usuario)
    expect(contas.find((c) => c.name === 'Corrente')?.balanceCents).toBe(200_000)
    expect(contas.find((c) => c.name === 'Poupança')?.balanceCents).toBe(0)

    const depois = await listarLancamentos(usuario, {})
    expect(depois.itens.filter((i) => i.status === 'estornado')).toHaveLength(2)
  })
})
