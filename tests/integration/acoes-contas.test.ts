import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, limparBanco, sqlAdmin } from './helpers'
import { criarConta, listarContasComSaldo } from '../../src/data/accounts'
import { somarSaldos } from '../../src/domain/balance'
import { criarLancamento } from '../../src/data/transactions'
import { isoDate } from '../../src/domain/dates'
import { cents } from '../../src/domain/money'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

describe('total da tela de saldos', () => {
  it('soma só o que está marcado como disponível', async () => {
    const usuario = await criarUsuario()

    await criarConta(usuario, {
      name: 'Corrente',
      type: 'corrente',
      initialBalanceCents: cents(100_000),
      initialBalanceDate: isoDate('2026-09-01'),
    })
    await criarConta(usuario, {
      name: 'Cartão',
      type: 'cartao_credito',
      initialBalanceCents: cents(-50_000),
      initialBalanceDate: isoDate('2026-09-01'),
    })

    const contas = await listarContasComSaldo(usuario)
    const disponivel = somarSaldos(contas.filter((c) => c.includeInAvailable && c.isLiquid))

    expect(disponivel.balanceCents).toBe(100_000)
    expect(contas).toHaveLength(2)
  })

  it('uma conta estimada torna o total estimado', async () => {
    const usuario = await criarUsuario()
    await criarConta(usuario, {
      name: 'Corrente',
      type: 'corrente',
      initialBalanceCents: cents(100_000),
      initialBalanceDate: isoDate('2026-09-01'),
    })

    const contas = await listarContasComSaldo(usuario)
    expect(somarSaldos(contas).isEstimated).toBe(true)
  })

  it('o total acompanha os lançamentos liquidados', async () => {
    const usuario = await criarUsuario()
    const conta = await criarConta(usuario, {
      name: 'Corrente',
      type: 'corrente',
      initialBalanceCents: cents(100_000),
      initialBalanceDate: isoDate('2026-09-01'),
    })

    await criarLancamento(usuario, {
      accountId: conta.id,
      kind: 'receita',
      nature: 'fixa',
      description: 'Salário',
      amountCents: cents(300_000),
      status: 'liquidado',
      competenceDate: isoDate('2026-09-05'),
      settledDate: isoDate('2026-09-05'),
    })

    const contas = await listarContasComSaldo(usuario)
    expect(somarSaldos(contas).balanceCents).toBe(400_000)
  })
})
