import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { isoDate } from '../../src/domain/dates'
import { cents } from '../../src/domain/money'
import {
  diasDoPeriodo,
  disponiveis,
  limiteVigente,
  periodoAnterior,
  periodosEntre,
  proximoPeriodo,
  type Limite,
} from '../../src/domain/budget'
import type { Cents } from '../../src/domain/types'

const p = (inicio: string, fim: string) => ({ inicio: isoDate(inicio), fim: isoDate(fim) })

describe('períodos', () => {
  it('anterior e próximo respeitam o dia de início', () => {
    const outubro = p('2026-10-05', '2026-11-04')
    expect(periodoAnterior(outubro, 5)).toEqual(p('2026-09-05', '2026-10-04'))
    expect(proximoPeriodo(outubro, 5)).toEqual(p('2026-11-05', '2026-12-04'))
    expect(diasDoPeriodo(outubro)).toBe(31)
  })

  it('periodosEntre lista os períodos que tocam o intervalo, em ordem', () => {
    expect(periodosEntre(isoDate('2026-08-20'), isoDate('2026-10-01'), 1)).toEqual([
      p('2026-08-01', '2026-08-31'), p('2026-09-01', '2026-09-30'), p('2026-10-01', '2026-10-31'),
    ])
  })
})

describe('limiteVigente', () => {
  const limites: Limite[] = [
    { startsOn: isoDate('2026-08-01'), amountCents: cents(50_000) },
    { startsOn: isoDate('2026-10-01'), amountCents: cents(60_000) },
  ]

  it('vale o mais recente que já começou', () => {
    expect(limiteVigente(limites, isoDate('2026-07-01'))).toBeNull()
    expect(limiteVigente(limites, isoDate('2026-09-01'))).toBe(50_000)
    expect(limiteVigente(limites, isoDate('2026-10-01'))).toBe(60_000)
    expect(limiteVigente(limites, isoDate('2027-03-01'))).toBe(60_000)
  })

  it('aceita limite datado no meio de um período, depois de mudar o dia de início', () => {
    // Criado com início no dia 1; depois a pessoa passou para o dia 5.
    expect(limiteVigente(limites, isoDate('2026-10-05'))).toBe(60_000)
  })
})

describe('disponiveis: acumulação', () => {
  const periodos = [p('2026-08-01', '2026-08-31'), p('2026-09-01', '2026-09-30'), p('2026-10-01', '2026-10-31')]
  const limites: Limite[] = [{ startsOn: isoDate('2026-08-01'), amountCents: cents(50_000) }]

  it('sem acumulação, o disponível é o limite', () => {
    const r = disponiveis({ periodos, limites, rolloverSince: null, realizado: new Map() })
    expect([...r.values()]).toEqual([50_000, 50_000, 50_000])
  })

  it('a sobra passa para o mês seguinte; o estouro não', () => {
    const realizado = new Map<string, Cents>([
      ['2026-08-01', cents(30_000)], // sobra 20.000
      ['2026-09-01', cents(90_000)], // disponível 70.000, estoura 20.000
    ])
    const r = disponiveis({ periodos, limites, rolloverSince: isoDate('2026-08-01'), realizado })
    expect([...r.values()]).toEqual([50_000, 70_000, 50_000])
  })

  it('acumula só a partir de quando foi ligada', () => {
    const realizado = new Map<string, Cents>([['2026-08-01', cents(0)], ['2026-09-01', cents(10_000)]])
    const r = disponiveis({ periodos, limites, rolloverSince: isoDate('2026-09-01'), realizado })
    // Agosto sobrou tudo, mas a acumulação só começou em setembro.
    expect([...r.values()]).toEqual([50_000, 50_000, 90_000])
  })

  it('período antes de existir orçamento fica sem disponível', () => {
    const r = disponiveis({
      periodos,
      limites: [{ startsOn: isoDate('2026-09-01'), amountCents: cents(1_000) }],
      rolloverSince: isoDate('2026-08-01'),
      realizado: new Map(),
    })
    expect([...r.values()]).toEqual([null, 1_000, 2_000])
  })
})

describe('invariantes (spec 6.6)', () => {
  const periodos = Array.from({ length: 12 }, (_, i) => {
    const inicio = isoDate(`2026-${String(i + 1).padStart(2, '0')}-01`)
    const fim = isoDate(new Date(Date.UTC(2026, i + 1, 0)).toISOString().slice(0, 10))
    return { inicio, fim }
  })
  const valoresArb = fc.array(fc.integer({ min: 0, max: 200_000 }), { minLength: 12, maxLength: 12 })
  const limitesArb = fc
    .array(fc.tuple(fc.integer({ min: 0, max: 11 }), fc.integer({ min: 0, max: 200_000 })), { minLength: 1, maxLength: 5 })
    .map((pares) => {
      const porMes = new Map(pares.map(([mes, valor]) => [mes, valor]))
      return [...porMes.entries()]
        .sort(([a], [b]) => a - b)
        .map(([mes, valor]): Limite => ({ startsOn: periodos[mes].inicio, amountCents: cents(valor) }))
    })

  it('2. com acumulação, o disponível nunca é menor que o limite e nunca carrega estouro', () => {
    fc.assert(
      fc.property(limitesArb, valoresArb, fc.integer({ min: 0, max: 11 }), (limites, gastos, ligada) => {
        const realizado = new Map(periodos.map((per, i) => [per.inicio as string, cents(gastos[i])]))
        const r = disponiveis({ periodos, limites, rolloverSince: periodos[ligada].inicio, realizado })

        periodos.forEach((per, i) => {
          const disponivel = r.get(per.inicio)
          const limite = limiteVigente(limites, per.inicio)
          if (limite === null) return expect(disponivel).toBeNull()
          expect(disponivel!).toBeGreaterThanOrEqual(limite)
          const anterior = i > 0 ? r.get(periodos[i - 1].inicio) : null
          if (anterior !== null && anterior !== undefined && i > ligada) {
            expect(disponivel).toBe(limite + Math.max(0, anterior - gastos[i - 1]))
          }
        })
      }),
    )
  })

  it('4. mudar o limite a partir de um período não altera nada antes dele', () => {
    fc.assert(
      fc.property(limitesArb, valoresArb, fc.integer({ min: 0, max: 11 }), fc.integer({ min: 0, max: 200_000 }), (limites, gastos, corte, novo) => {
        const realizado = new Map(periodos.map((per, i) => [per.inicio as string, cents(gastos[i])]))
        const entrada = { periodos, rolloverSince: periodos[0].inicio, realizado }
        const antes = disponiveis({ ...entrada, limites })

        const mudados = [
          ...limites.filter((l) => l.startsOn !== periodos[corte].inicio),
          { startsOn: periodos[corte].inicio, amountCents: cents(novo) },
        ]
        const depois = disponiveis({ ...entrada, limites: mudados })

        for (const per of periodos.slice(0, corte)) {
          expect(depois.get(per.inicio)).toBe(antes.get(per.inicio))
        }
      }),
    )
  })
})
