import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, limparBanco, sqlAdmin } from './helpers'
import { criarConta } from '../../src/data/accounts'
import { criarCategoria } from '../../src/data/categories'
import { criarLancamento, listarLancamentos } from '../../src/data/transactions'
import { estaAtrasado } from '../../src/domain/transaction'
import { isoDate } from '../../src/domain/dates'
import { cents } from '../../src/domain/money'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

describe('lista de lançamentos', () => {
  it('ordena do mais recente para o mais antigo', async () => {
    const usuario = await criarUsuario()
    const conta = await criarConta(usuario, {
      name: 'Corrente', type: 'corrente',
      initialBalanceCents: cents(0), initialBalanceDate: isoDate('2026-09-01'),
    })
    const categoria = await criarCategoria(usuario, { name: 'Mercado', kind: 'despesa' })

    for (const dia of ['2026-09-05', '2026-09-20', '2026-09-12']) {
      await criarLancamento(usuario, {
        accountId: conta.id, categoryId: categoria.id,
        kind: 'despesa', nature: 'variavel', description: `Dia ${dia}`,
        amountCents: cents(1000), status: 'liquidado',
        competenceDate: isoDate(dia), settledDate: isoDate(dia),
      })
    }

    const { itens } = await listarLancamentos(usuario, {})
    expect(itens.map((i) => i.competenceDate)).toEqual(['2026-09-20', '2026-09-12', '2026-09-05'])
  })

  it('o atrasado é derivado na leitura, não gravado', async () => {
    const usuario = await criarUsuario()
    const conta = await criarConta(usuario, {
      name: 'Corrente', type: 'corrente',
      initialBalanceCents: cents(0), initialBalanceDate: isoDate('2026-09-01'),
    })
    const categoria = await criarCategoria(usuario, { name: 'Luz', kind: 'despesa' })

    await criarLancamento(usuario, {
      accountId: conta.id, categoryId: categoria.id,
      kind: 'despesa', nature: 'fixa', description: 'Conta de luz',
      amountCents: cents(15000), status: 'previsto',
      competenceDate: isoDate('2026-09-10'), settledDate: null,
    })

    const { itens } = await listarLancamentos(usuario, {})
    expect(itens[0].status).toBe('previsto')
    expect(estaAtrasado(itens[0], isoDate('2026-09-18'))).toBe(true)
    expect(estaAtrasado(itens[0], isoDate('2026-09-09'))).toBe(false)
  })

  it('filtra por estado', async () => {
    const usuario = await criarUsuario()
    const conta = await criarConta(usuario, {
      name: 'Corrente', type: 'corrente',
      initialBalanceCents: cents(0), initialBalanceDate: isoDate('2026-09-01'),
    })
    const categoria = await criarCategoria(usuario, { name: 'Mercado', kind: 'despesa' })

    await criarLancamento(usuario, {
      accountId: conta.id, categoryId: categoria.id, kind: 'despesa', nature: 'variavel',
      description: 'Paga', amountCents: cents(1000), status: 'liquidado',
      competenceDate: isoDate('2026-09-10'), settledDate: isoDate('2026-09-10'),
    })
    await criarLancamento(usuario, {
      accountId: conta.id, categoryId: categoria.id, kind: 'despesa', nature: 'variavel',
      description: 'Prevista', amountCents: cents(1000), status: 'previsto',
      competenceDate: isoDate('2026-09-25'), settledDate: null,
    })

    const previstos = await listarLancamentos(usuario, { status: 'previsto' })
    expect(previstos.total).toBe(1)
    expect(previstos.itens[0].description).toBe('Prevista')
  })
})
