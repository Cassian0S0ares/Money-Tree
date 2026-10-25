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
    name: 'Corrente',
    type: 'corrente',
    initialBalanceCents: cents(100_000),
    initialBalanceDate: isoDate('2026-09-01'),
  })
  return { usuario, corrente }
}

describe('prepararConciliacao', () => {
  it('calcula a diferença sem gravar nada', async () => {
    const { usuario, corrente } = await conta()

    const previa = await prepararConciliacao(usuario, corrente.id, cents(98_000))

    expect(previa.calculatedCents).toBe(100_000)
    expect(previa.differenceCents).toBe(-2_000)
    expect(previa.confere).toBe(false)
    expect(previa.decisoesPossiveis[0]).toBe('lancamento_localizado')

    const [depois] = await listarContasComSaldo(usuario)
    expect(depois.balanceCents).toBe(100_000)
    expect(depois.isEstimated).toBe(true)
  })
})

describe('registrarConciliacao', () => {
  it('sem diferença, apenas marca a conta como conciliada', async () => {
    const { usuario, corrente } = await conta()

    const resultado = await registrarConciliacao(usuario, {
      accountId: corrente.id,
      reportedCents: cents(100_000),
      decision: 'adiado',
      quando: isoDate('2026-09-18'),
    })

    expect(resultado.adjustmentTransactionId).toBeNull()

    const [depois] = await listarContasComSaldo(usuario)
    expect(depois.isEstimated).toBe(false)
  })

  it('com ajuste, cria o lançamento e o saldo passa a bater', async () => {
    const { usuario, corrente } = await conta()

    const resultado = await registrarConciliacao(usuario, {
      accountId: corrente.id,
      reportedCents: cents(98_000),
      decision: 'ajuste_criado',
      motivo: 'tarifa não lançada',
      quando: isoDate('2026-09-18'),
    })

    expect(resultado.adjustmentTransactionId).not.toBeNull()

    const [depois] = await listarContasComSaldo(usuario)
    expect(depois.balanceCents).toBe(98_000)
    expect(depois.isEstimated).toBe(false)
  })

  it('ajuste sem motivo é recusado, como manda o §5.3.1', async () => {
    const { usuario, corrente } = await conta()

    await expect(
      registrarConciliacao(usuario, {
        accountId: corrente.id,
        reportedCents: cents(98_000),
        decision: 'ajuste_criado',
        quando: isoDate('2026-09-18'),
      }),
    ).rejects.toThrow(/motivo/i)
  })

  it('adiar com diferença não cria ajuste nem esconde a divergência', async () => {
    const { usuario, corrente } = await conta()

    const resultado = await registrarConciliacao(usuario, {
      accountId: corrente.id,
      reportedCents: cents(98_000),
      decision: 'adiado',
      quando: isoDate('2026-09-18'),
    })

    expect(resultado.adjustmentTransactionId).toBeNull()

    const [depois] = await listarContasComSaldo(usuario)
    expect(depois.balanceCents).toBe(100_000)
    // O banco diz 98.000. Mostrar 100.000 como confirmado seria mentir (§6.1).
    expect(depois.isEstimated).toBe(true)
  })
})
