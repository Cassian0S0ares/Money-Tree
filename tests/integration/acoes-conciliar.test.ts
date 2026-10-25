import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, limparBanco, sqlAdmin } from './helpers'
import { criarConta, listarContasComSaldo } from '../../src/data/accounts'
import { prepararConciliacao, registrarConciliacao } from '../../src/data/reconciliations'
import { isoDate } from '../../src/domain/dates'
import { cents } from '../../src/domain/money'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

async function conta() {
  const usuario = await criarUsuario()
  const corrente = await criarConta(usuario, {
    name: 'Corrente', type: 'corrente',
    initialBalanceCents: cents(150_000), initialBalanceDate: isoDate('2026-09-01'),
  })
  return { usuario, corrente }
}

describe('fluxo de conciliação', () => {
  it('a prévia não grava nada', async () => {
    const { usuario, corrente } = await conta()

    await prepararConciliacao(usuario, corrente.id, cents(140_000))

    const [registros] = await sqlAdmin<{ total: string }[]>`
      select count(*)::text as total from reconciliations
    `
    expect(Number(registros.total)).toBe(0)

    const [depois] = await listarContasComSaldo(usuario)
    expect(depois.isEstimated).toBe(true)
  })

  it('a decisão de ajuste faz o saldo bater e deixa a trilha', async () => {
    const { usuario, corrente } = await conta()

    await registrarConciliacao(usuario, {
      accountId: corrente.id,
      reportedCents: cents(140_000),
      decision: 'ajuste_criado',
      motivo: 'tarifa de manutenção não lançada',
      quando: isoDate('2026-09-18'),
    })

    const [depois] = await listarContasComSaldo(usuario)
    expect(depois.balanceCents).toBe(140_000)
    expect(depois.isEstimated).toBe(false)

    const [registro] = await sqlAdmin<{ difference_cents: string; decision: string }[]>`
      select difference_cents, decision from reconciliations
    `
    expect(Number(registro.difference_cents)).toBe(-10_000)
    expect(registro.decision).toBe('ajuste_criado')
  })

  it('o ajuste gerado carrega o motivo e é rastreável', async () => {
    const { usuario, corrente } = await conta()

    const resultado = await registrarConciliacao(usuario, {
      accountId: corrente.id,
      reportedCents: cents(160_000),
      decision: 'ajuste_criado',
      motivo: 'depósito antigo não registrado',
      quando: isoDate('2026-09-18'),
    })

    const [ajuste] = await sqlAdmin<{ adjustment_reason: string; direction: number; kind: string }[]>`
      select adjustment_reason, direction, kind from transactions where id = ${resultado.adjustmentTransactionId!}
    `
    expect(ajuste.kind).toBe('ajuste')
    expect(ajuste.direction).toBe(1)
    expect(ajuste.adjustment_reason).toBe('depósito antigo não registrado')
  })
})
