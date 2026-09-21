import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { calcularSaldo, somarSaldos, type LinhaRazao } from '../../src/domain/balance'
import { cents } from '../../src/domain/money'
import type { TransactionStatus } from '../../src/domain/types'

function linha(
  valor: number,
  status: TransactionStatus = 'liquidado',
  settledAt: Date | null = new Date('2026-09-10T00:00:00Z'),
): LinhaRazao {
  return { signedAmountCents: cents(valor), status, settledAt }
}

describe('calcularSaldo', () => {
  it('soma apenas liquidado e conciliado', () => {
    const { balanceCents } = calcularSaldo({
      initialBalanceCents: cents(100_00),
      linhas: [
        linha(50_00, 'liquidado'),
        linha(25_00, 'conciliado'),
        linha(-999_00, 'previsto', null),
        linha(-999_00, 'pendente', null),
        linha(-999_00, 'cancelado', null),
        linha(-999_00, 'estornado', null),
      ],
      lastReconciledAt: null,
    })
    expect(balanceCents).toBe(175_00)
  })

  it('sem lançamentos, o saldo é o inicial', () => {
    expect(
      calcularSaldo({ initialBalanceCents: cents(42), linhas: [], lastReconciledAt: null })
        .balanceCents,
    ).toBe(42)
  })

  it('conta nunca conciliada é estimada', () => {
    expect(
      calcularSaldo({ initialBalanceCents: cents(0), linhas: [], lastReconciledAt: null })
        .isEstimated,
    ).toBe(true)
  })

  it('conciliada e sem movimento posterior não é estimada', () => {
    const resultado = calcularSaldo({
      initialBalanceCents: cents(0),
      linhas: [linha(100, 'conciliado', new Date('2026-09-01T00:00:00Z'))],
      lastReconciledAt: new Date('2026-09-05T00:00:00Z'),
    })
    expect(resultado.isEstimated).toBe(false)
  })

  it('movimento depois da conciliação volta a estimar', () => {
    const resultado = calcularSaldo({
      initialBalanceCents: cents(0),
      linhas: [linha(100, 'liquidado', new Date('2026-09-10T00:00:00Z'))],
      lastReconciledAt: new Date('2026-09-05T00:00:00Z'),
    })
    expect(resultado.isEstimated).toBe(true)
  })
})

describe('somarSaldos', () => {
  it('soma os valores', () => {
    expect(
      somarSaldos([
        { balanceCents: cents(100), isEstimated: false },
        { balanceCents: cents(250), isEstimated: false },
      ]),
    ).toEqual({ balanceCents: 350, isEstimated: false })
  })

  it('uma conta estimada contamina o total', () => {
    expect(
      somarSaldos([
        { balanceCents: cents(100), isEstimated: false },
        { balanceCents: cents(250), isEstimated: true },
      ]).isEstimated,
    ).toBe(true)
  })

  it('lista vazia é zero e não é estimada', () => {
    expect(somarSaldos([])).toEqual({ balanceCents: 0, isEstimated: false })
  })
})

describe('invariantes', () => {
  const geradorLinha = fc.record({
    signedAmountCents: fc.integer({ min: -1_000_000, max: 1_000_000 }),
    status: fc.constantFrom<TransactionStatus>(
      'previsto',
      'pendente',
      'liquidado',
      'conciliado',
      'cancelado',
      'estornado',
    ),
  })

  it('INVARIANTE: o saldo independe da ordem de inserção', () => {
    fc.assert(
      fc.property(fc.array(geradorLinha, { maxLength: 60 }), (cruas) => {
        const linhas: LinhaRazao[] = cruas.map((c) => ({
          signedAmountCents: cents(c.signedAmountCents),
          status: c.status,
          settledAt: null,
        }))
        const entrada = { initialBalanceCents: cents(0), lastReconciledAt: null }

        const direto = calcularSaldo({ ...entrada, linhas }).balanceCents
        const invertido = calcularSaldo({ ...entrada, linhas: [...linhas].reverse() }).balanceCents

        expect(direto).toBe(invertido)
      }),
    )
  })

  it('INVARIANTE: transferência entre contas incluídas não altera o total', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (valor) => {
        const origem = calcularSaldo({
          initialBalanceCents: cents(10_000_00),
          linhas: [linha(-valor)],
          lastReconciledAt: null,
        })
        const destino = calcularSaldo({
          initialBalanceCents: cents(0),
          linhas: [linha(valor)],
          lastReconciledAt: null,
        })

        expect(somarSaldos([origem, destino]).balanceCents).toBe(10_000_00)
      }),
    )
  })

  it('INVARIANTE: estorno anula exatamente o original', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (valor) => {
        const semNada = calcularSaldo({
          initialBalanceCents: cents(500_00),
          linhas: [],
          lastReconciledAt: null,
        }).balanceCents

        // O original vira `estornado` e deixa de contar; a linha de estorno
        // entra liquidada com o sinal oposto.
        const comEstorno = calcularSaldo({
          initialBalanceCents: cents(500_00),
          linhas: [linha(-valor, 'estornado', null), linha(valor, 'liquidado')],
          lastReconciledAt: null,
        }).balanceCents

        expect(comEstorno).toBe(semNada + valor)
      }),
    )
  })
})
