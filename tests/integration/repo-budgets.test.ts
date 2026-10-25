import fc from 'fast-check'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, limparBanco, sqlAdmin } from './helpers'
import { criarConta } from '../../src/data/accounts'
import { criarCategoria } from '../../src/data/categories'
import { criarLancamento, criarTransferencia, estornarLancamento } from '../../src/data/transactions'
import {
  alterarLimite,
  criarOrcamento,
  definirAcumulacao,
  removerOrcamento,
  resumoOrcamento,
} from '../../src/data/budgets'
import { isoDate, mesFinanceiro } from '../../src/domain/dates'
import { cents } from '../../src/domain/money'
import type { TransactionNature, TransactionStatus } from '../../src/domain/types'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

const OUTUBRO = { inicio: isoDate('2026-10-01'), fim: isoDate('2026-10-31') }
const HOJE = isoDate('2026-10-15')

async function cenario() {
  const usuario = await criarUsuario()
  const conta = await criarConta(usuario, {
    name: 'Corrente', type: 'corrente',
    initialBalanceCents: cents(1_000_000), initialBalanceDate: isoDate('2026-01-01'),
  })
  const poupanca = await criarConta(usuario, {
    name: 'Poupança', type: 'poupanca',
    initialBalanceCents: cents(0), initialBalanceDate: isoDate('2026-01-01'),
  })
  const mercado = await criarCategoria(usuario, { name: 'Mercado', kind: 'despesa' })
  const feira = await criarCategoria(usuario, { name: 'Feira', kind: 'despesa', parentId: mercado.id })
  const lazer = await criarCategoria(usuario, { name: 'Lazer', kind: 'despesa' })
  const renda = await criarCategoria(usuario, { name: 'Renda', kind: 'receita' })

  const gasto = (
    categoryId: string,
    valor: number,
    data: string,
    status: TransactionStatus = 'liquidado',
    nature: TransactionNature = 'variavel',
  ) =>
    criarLancamento(usuario, {
      accountId: conta.id, categoryId, kind: 'despesa', nature, description: 'Gasto',
      amountCents: cents(valor), status, competenceDate: isoDate(data),
      settledDate: status === 'liquidado' ? isoDate(data) : null,
    })

  return { usuario, conta, poupanca, mercado, feira, lazer, renda, gasto }
}

const item = (resumo: Awaited<ReturnType<typeof resumoOrcamento>>, categoriaId: string) =>
  resumo.itens.find((i) => i.categoriaId === categoriaId)

describe('o que conta como gasto', () => {
  it('subcategoria soma na raiz; estornado, cancelado, receita, transferência e ajuste não contam', async () => {
    const c = await cenario()
    await criarOrcamento(c.usuario, { categoryId: c.mercado.id, amountCents: cents(60_000), aPartirDe: OUTUBRO.inicio })

    await c.gasto(c.mercado.id, 10_000, '2026-10-03')
    await c.gasto(c.feira.id, 5_000, '2026-10-04')
    const estornado = await c.gasto(c.mercado.id, 99_000, '2026-10-05')
    await estornarLancamento(c.usuario, estornado.id, 'errado')
    const cancelado = await c.gasto(c.mercado.id, 77_000, '2026-10-06', 'previsto')
    const { atualizarStatus } = await import('../../src/data/transactions')
    await atualizarStatus(c.usuario, cancelado.id, 'cancelado', null)
    await criarLancamento(c.usuario, {
      accountId: c.conta.id, categoryId: c.renda.id, kind: 'receita', nature: 'fixa', description: 'Salário',
      amountCents: cents(500_000), status: 'liquidado', competenceDate: isoDate('2026-10-05'), settledDate: isoDate('2026-10-05'),
    })
    await criarTransferencia(c.usuario, {
      fromAccountId: c.conta.id, toAccountId: c.poupanca.id, amountCents: cents(30_000),
      description: 'Reserva', competenceDate: isoDate('2026-10-07'), settledDate: isoDate('2026-10-07'), status: 'liquidado',
    })
    // Fora do período.
    await c.gasto(c.mercado.id, 1_000, '2026-09-30')

    const resumo = await resumoOrcamento(c.usuario, OUTUBRO, HOJE, 1)
    expect(item(resumo, c.mercado.id)).toMatchObject({ realizado: 15_000, comprometido: 0 })
  })

  it('previsto e pendente entram como comprometido, separados do realizado', async () => {
    const c = await cenario()
    await criarOrcamento(c.usuario, { categoryId: c.mercado.id, amountCents: cents(60_000), aPartirDe: OUTUBRO.inicio })
    await c.gasto(c.mercado.id, 10_000, '2026-10-03')
    await c.gasto(c.mercado.id, 4_000, '2026-10-20', 'previsto')
    await c.gasto(c.feira.id, 1_500, '2026-10-21', 'pendente')

    expect(item(await resumoOrcamento(c.usuario, OUTUBRO, HOJE, 1), c.mercado.id)).toMatchObject({
      realizado: 10_000,
      comprometido: 5_500,
    })
  })

  it('separa o variável do fixo, para a previsão não extrapolar o aluguel', async () => {
    const c = await cenario()
    await criarOrcamento(c.usuario, { categoryId: c.mercado.id, amountCents: cents(60_000), aPartirDe: OUTUBRO.inicio })
    await c.gasto(c.mercado.id, 30_000, '2026-10-02', 'liquidado', 'fixa')
    await c.gasto(c.mercado.id, 7_000, '2026-10-03', 'liquidado', 'variavel')

    expect(item(await resumoOrcamento(c.usuario, OUTUBRO, HOJE, 1), c.mercado.id)).toMatchObject({
      realizado: 37_000,
      realizadoVariavel: 7_000,
    })
  })

  it('categoria sem orçamento aparece com o gasto do período', async () => {
    const c = await cenario()
    await c.gasto(c.lazer.id, 12_000, '2026-10-08')

    const resumo = await resumoOrcamento(c.usuario, OUTUBRO, HOJE, 1)
    expect(resumo.semOrcamento.find((s) => s.categoriaId === c.lazer.id)).toMatchObject({ realizado: 12_000 })
    expect(resumo.itens).toHaveLength(0)
  })
})

describe('limite datado e acumulação', () => {
  it('mudar o limite daqui em diante preserva os meses anteriores', async () => {
    const c = await cenario()
    const orcamento = await criarOrcamento(c.usuario, {
      categoryId: c.mercado.id, amountCents: cents(50_000), aPartirDe: isoDate('2026-09-01'),
    })
    await alterarLimite(c.usuario, orcamento.id, cents(70_000), OUTUBRO.inicio)

    const setembro = { inicio: isoDate('2026-09-01'), fim: isoDate('2026-09-30') }
    expect(item(await resumoOrcamento(c.usuario, setembro, HOJE, 1), c.mercado.id)?.limite).toBe(50_000)
    expect(item(await resumoOrcamento(c.usuario, OUTUBRO, HOJE, 1), c.mercado.id)?.limite).toBe(70_000)
  })

  it('acumula a sobra ao longo de três meses, e só a sobra', async () => {
    const c = await cenario()
    await criarOrcamento(c.usuario, {
      categoryId: c.mercado.id, amountCents: cents(50_000), aPartirDe: isoDate('2026-08-01'), rollover: true,
    })
    await c.gasto(c.mercado.id, 30_000, '2026-08-10') // sobra 20.000
    await c.gasto(c.mercado.id, 90_000, '2026-09-10') // disponível 70.000, estoura

    const outubro = item(await resumoOrcamento(c.usuario, OUTUBRO, HOJE, 1), c.mercado.id)!
    expect(outubro).toMatchObject({ limite: 50_000, disponivel: 50_000 })

    const setembro = item(
      await resumoOrcamento(c.usuario, { inicio: isoDate('2026-09-01'), fim: isoDate('2026-09-30') }, HOJE, 1),
      c.mercado.id,
    )!
    expect(setembro).toMatchObject({ disponivel: 70_000, avaliacao: { situacao: 'estourado' } })
  })

  it('ligar a acumulação depois vale dali em diante', async () => {
    const c = await cenario()
    const orcamento = await criarOrcamento(c.usuario, {
      categoryId: c.mercado.id, amountCents: cents(50_000), aPartirDe: isoDate('2026-08-01'),
    })
    await c.gasto(c.mercado.id, 10_000, '2026-09-10')
    await definirAcumulacao(c.usuario, orcamento.id, true, isoDate('2026-09-01'))

    expect(item(await resumoOrcamento(c.usuario, OUTUBRO, HOJE, 1), c.mercado.id)?.disponivel).toBe(90_000)
  })

  it('o dia de início do mês define o período', async () => {
    const c = await cenario()
    await criarOrcamento(c.usuario, { categoryId: c.mercado.id, amountCents: cents(50_000), aPartirDe: isoDate('2026-10-05') })
    await c.gasto(c.mercado.id, 1_000, '2026-10-04') // período anterior
    await c.gasto(c.mercado.id, 2_000, '2026-11-04') // ainda no período de outubro

    const periodo = mesFinanceiro(isoDate('2026-10-15'), 5)
    expect(item(await resumoOrcamento(c.usuario, periodo, HOJE, 5), c.mercado.id)?.realizado).toBe(2_000)
  })

  it('remover arquiva: some do resumo e pode ser criado de novo', async () => {
    const c = await cenario()
    const orcamento = await criarOrcamento(c.usuario, { categoryId: c.mercado.id, amountCents: cents(50_000), aPartirDe: OUTUBRO.inicio })
    await removerOrcamento(c.usuario, orcamento.id)

    expect((await resumoOrcamento(c.usuario, OUTUBRO, HOJE, 1)).itens).toHaveLength(0)
    await expect(
      criarOrcamento(c.usuario, { categoryId: c.mercado.id, amountCents: cents(1), aPartirDe: OUTUBRO.inicio }),
    ).resolves.toBeTruthy()
  })
})

describe('invariante 1 (spec 6.6): sem dupla contagem', () => {
  it('a soma do realizado das raízes é o total de despesas realizadas com categoria', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            categoria: fc.integer({ min: 0, max: 2 }),
            valor: fc.integer({ min: 1, max: 50_000 }),
            dia: fc.integer({ min: 1, max: 31 }),
            status: fc.constantFrom<TransactionStatus>('liquidado', 'previsto'),
          }),
          { maxLength: 15 },
        ),
        async (lancamentos) => {
          // Linha liquidada não se apaga (gatilho da fatia 1): cada rodada
          // usa um usuário novo em vez de limpar o anterior.
          const u = await cenario()
          const ids = [u.mercado.id, u.feira.id, u.lazer.id]
          for (const l of lancamentos) {
            await u.gasto(ids[l.categoria], l.valor, `2026-10-${String(l.dia).padStart(2, '0')}`, l.status)
          }
          await criarOrcamento(u.usuario, { categoryId: u.mercado.id, amountCents: cents(1), aPartirDe: OUTUBRO.inicio })

          const resumo = await resumoOrcamento(u.usuario, OUTUBRO, HOJE, 1)
          const somaRaizes =
            resumo.itens.reduce((s, i) => s + i.realizado, 0) +
            resumo.semOrcamento.reduce((s, i) => s + i.realizado, 0)
          const total = lancamentos.filter((l) => l.status === 'liquidado').reduce((s, l) => s + l.valor, 0)

          expect(somaRaizes).toBe(total)
          expect(resumo.totais.realizadoComOrcamento + resumo.totais.realizadoSemOrcamento).toBe(total)
        },
      ),
      { numRuns: 15 },
    )
  })
})

describe('AMEAÇA T3/T20', () => {
  it('orçamento em categoria de outro usuário é recusado, e um não vê o do outro', async () => {
    const dono = await cenario()
    const intruso = await cenario()
    await criarOrcamento(dono.usuario, { categoryId: dono.mercado.id, amountCents: cents(1), aPartirDe: OUTUBRO.inicio })

    await expect(
      criarOrcamento(intruso.usuario, { categoryId: dono.mercado.id, amountCents: cents(1), aPartirDe: OUTUBRO.inicio }),
    ).rejects.toThrow()
    expect((await resumoOrcamento(intruso.usuario, OUTUBRO, HOJE, 1)).itens).toHaveLength(0)
  })
})

