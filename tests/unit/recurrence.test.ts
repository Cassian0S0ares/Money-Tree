import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { isoDate } from '../../src/domain/dates'
import type { IsoDate } from '../../src/domain/types'
import {
  RegraInvalidaError,
  descreverRegra,
  ocorrencias,
  proximaOcorrencia,
  validarRegra,
  type RegraDatas,
} from '../../src/domain/recurrence'

function regra(parcial: Partial<RegraDatas> & Pick<RegraDatas, 'startDate' | 'unit'>): RegraDatas {
  const dia = Number(parcial.startDate.slice(8, 10))
  return {
    interval: 1,
    dayOfMonth: parcial.unit === 'mes' || parcial.unit === 'ano' ? dia : null,
    endDate: null,
    maxOccurrences: null,
    weekendPolicy: 'manter',
    ...parcial,
  }
}

const nominais = (r: RegraDatas, de: string, ate: string) =>
  ocorrencias(r, isoDate(de), isoDate(ate)).map((o) => o.nominal)

describe('ocorrencias: casos do calendário', () => {
  it('mensal no dia 31 cai no último dia dos meses curtos e volta ao 31', () => {
    const r = regra({ startDate: isoDate('2026-01-31'), unit: 'mes' })
    expect(nominais(r, '2026-01-01', '2026-05-31')).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31',
    ])
  })

  it('anual em 29 de fevereiro cai no dia 28 nos anos não bissextos', () => {
    const r = regra({ startDate: isoDate('2028-02-29'), unit: 'ano' })
    expect(nominais(r, '2028-01-01', '2032-12-31')).toEqual([
      '2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29',
    ])
  })

  it('a cada 2 semanas, a partir da âncora', () => {
    const r = regra({ startDate: isoDate('2026-10-02'), unit: 'semana', interval: 2 })
    expect(nominais(r, '2026-10-01', '2026-11-15')).toEqual(['2026-10-02', '2026-10-16', '2026-10-30', '2026-11-13'])
  })

  it('a cada 3 meses no dia 10', () => {
    const r = regra({ startDate: isoDate('2026-01-10'), unit: 'mes', interval: 3 })
    expect(nominais(r, '2026-01-01', '2026-12-31')).toEqual(['2026-01-10', '2026-04-10', '2026-07-10', '2026-10-10'])
  })

  it('a janela pode começar no meio da série', () => {
    const r = regra({ startDate: isoDate('2020-01-05'), unit: 'mes' })
    expect(nominais(r, '2026-10-01', '2026-11-30')).toEqual(['2026-10-05', '2026-11-05'])
  })

  it('o índice conta desde a âncora, não desde a janela', () => {
    const r = regra({ startDate: isoDate('2026-01-05'), unit: 'mes' })
    expect(ocorrencias(r, isoDate('2026-03-01'), isoDate('2026-03-31'))[0].indice).toBe(2)
  })

  it('sábado e domingo vencem na segunda, sem mudar a data nominal', () => {
    // 2026-10-31 é sábado; 2026-11-01, domingo.
    const r = regra({ startDate: isoDate('2026-10-31'), unit: 'dia', weekendPolicy: 'proximo_dia_util' })
    expect(ocorrencias(r, isoDate('2026-10-31'), isoDate('2026-11-02'))).toEqual([
      { nominal: '2026-10-31', vencimento: '2026-11-02', indice: 0 },
      { nominal: '2026-11-01', vencimento: '2026-11-02', indice: 1 },
      { nominal: '2026-11-02', vencimento: '2026-11-02', indice: 2 },
    ])
  })

  it('respeita data final e número de vezes', () => {
    const ate = regra({ startDate: isoDate('2026-01-05'), unit: 'mes', endDate: isoDate('2026-03-05') })
    expect(nominais(ate, '2026-01-01', '2026-12-31')).toEqual(['2026-01-05', '2026-02-05', '2026-03-05'])

    const vezes = regra({ startDate: isoDate('2026-01-05'), unit: 'mes', maxOccurrences: 2 })
    expect(nominais(vezes, '2026-01-01', '2026-12-31')).toEqual(['2026-01-05', '2026-02-05'])
  })

  it('nada antes do início da regra', () => {
    const r = regra({ startDate: isoDate('2026-06-05'), unit: 'mes' })
    expect(nominais(r, '2026-01-01', '2026-06-30')).toEqual(['2026-06-05'])
  })
})

describe('validarRegra', () => {
  const valida = regra({ startDate: isoDate('2026-01-31'), unit: 'mes' })

  it('aceita regra bem formada, inclusive início no fim de mês curto pedindo o 31', () => {
    expect(() => validarRegra(valida)).not.toThrow()
    expect(() => validarRegra({ ...valida, startDate: isoDate('2026-02-28'), dayOfMonth: 31 })).not.toThrow()
  })

  it.each([
    ['intervalo zero', { interval: 0 }],
    ['intervalo acima de 366', { interval: 367 }],
    ['dia do mês fora de 1–31', { dayOfMonth: 32 }],
    ['dia do mês diferente do início', { startDate: isoDate('2026-01-10'), dayOfMonth: 5 }],
    ['dia do mês em regra semanal', { unit: 'semana' as const, dayOfMonth: 5 }],
    ['fim antes do início', { endDate: isoDate('2025-12-31') }],
    ['dois fins', { endDate: isoDate('2026-12-31'), maxOccurrences: 3 }],
    ['zero vezes', { maxOccurrences: 0 }],
  ])('recusa %s', (_nome, mudanca) => {
    expect(() => validarRegra({ ...valida, ...mudanca })).toThrow(RegraInvalidaError)
  })
})

describe('descreverRegra', () => {
  it.each([
    [regra({ startDate: isoDate('2026-10-05'), unit: 'mes' }), 'Todo dia 5'],
    [regra({ startDate: isoDate('2026-10-31'), unit: 'mes' }), 'Todo dia 31 (ou o último dia do mês)'],
    [regra({ startDate: isoDate('2026-10-10'), unit: 'mes', interval: 3 }), 'A cada 3 meses, no dia 10'],
    [regra({ startDate: isoDate('2026-10-30'), unit: 'semana' }), 'Toda sexta-feira'],
    [regra({ startDate: isoDate('2026-10-31'), unit: 'semana' }), 'Todo sábado'],
    [regra({ startDate: isoDate('2026-10-26'), unit: 'semana', interval: 2 }), 'A cada 2 semanas, às segundas-feiras'],
    [regra({ startDate: isoDate('2026-11-01'), unit: 'semana', interval: 2 }), 'A cada 2 semanas, aos domingos'],
    [regra({ startDate: isoDate('2026-10-25'), unit: 'dia' }), 'Todo dia'],
    [regra({ startDate: isoDate('2026-10-25'), unit: 'dia', interval: 15 }), 'A cada 15 dias'],
    [regra({ startDate: isoDate('2027-03-15'), unit: 'ano' }), 'Todo ano em 15 de março'],
    [regra({ startDate: isoDate('2028-02-29'), unit: 'ano' }), 'Todo ano em 29 de fevereiro (ou 28 nos anos não bissextos)'],
    [regra({ startDate: isoDate('2027-03-15'), unit: 'ano', interval: 2 }), 'A cada 2 anos, em 15 de março'],
    [regra({ startDate: isoDate('2026-10-05'), unit: 'mes', maxOccurrences: 12 }), 'Todo dia 5, 12 vezes'],
    [regra({ startDate: isoDate('2026-10-05'), unit: 'mes', endDate: isoDate('2027-03-05') }), 'Todo dia 5, até 05/03/2027'],
  ])('%#: %s', (r, esperado) => {
    expect(descreverRegra(r)).toBe(esperado)
  })
})

describe('invariantes (spec 6.2)', () => {
  const DIA = 86_400_000
  const base = Date.UTC(2024, 0, 1)
  const dataArb = fc.integer({ min: 0, max: 365 * 6 }).map((d) => isoDate(new Date(base + d * DIA).toISOString().slice(0, 10)))

  const regraArb = fc
    .record({
      startDate: dataArb,
      unit: fc.constantFrom<RegraDatas['unit']>('dia', 'semana', 'mes', 'ano'),
      interval: fc.integer({ min: 1, max: 12 }),
      fim: fc.constantFrom('nenhum', 'vezes', 'ate'),
      vezes: fc.integer({ min: 1, max: 40 }),
      diasAteOFim: fc.integer({ min: 0, max: 900 }),
      weekendPolicy: fc.constantFrom<RegraDatas['weekendPolicy']>('manter', 'proximo_dia_util'),
      pedirUltimoDia: fc.boolean(),
    })
    .map((g): RegraDatas => {
      const dia = Number(g.startDate.slice(8, 10))
      const ultimoDoMes = new Date(
        Date.UTC(Number(g.startDate.slice(0, 4)), Number(g.startDate.slice(5, 7)), 0),
      ).getUTCDate()
      const ehMensal = g.unit === 'mes' || g.unit === 'ano'
      return {
        startDate: g.startDate,
        unit: g.unit,
        interval: g.interval,
        // Início no último dia de um mês pode pedir o dia 31 ("todo fim de mês").
        dayOfMonth: ehMensal ? (g.pedirUltimoDia && dia === ultimoDoMes ? 31 : dia) : null,
        weekendPolicy: g.weekendPolicy,
        endDate:
          g.fim === 'ate'
            ? isoDate(new Date(Date.parse(g.startDate) + g.diasAteOFim * DIA).toISOString().slice(0, 10))
            : null,
        maxOccurrences: g.fim === 'vezes' ? g.vezes : null,
      }
    })

  const janelaArb = fc.tuple(dataArb, dataArb).map(([a, b]): [IsoDate, IsoDate] => (a <= b ? [a, b] : [b, a]))

  it('1. dentro da janela e da vida da regra, em ordem estritamente crescente', () => {
    fc.assert(
      fc.property(regraArb, janelaArb, (r, [de, ate]) => {
        const lista = ocorrencias(r, de, ate)
        for (const [i, o] of lista.entries()) {
          expect(o.nominal >= de && o.nominal <= ate).toBe(true)
          expect(o.nominal >= r.startDate).toBe(true)
          if (r.endDate) expect(o.nominal <= r.endDate).toBe(true)
          if (i > 0) expect(o.nominal > lista[i - 1].nominal).toBe(true)
        }
      }),
    )
  })

  it('2. partição: [a, c] é [a, b] seguido de [b+1, c]', () => {
    fc.assert(
      fc.property(regraArb, fc.tuple(dataArb, dataArb, dataArb), (r, datas) => {
        const [a, b, c] = [...datas].sort()
        const depoisDeB = isoDate(new Date(Date.parse(b) + DIA).toISOString().slice(0, 10))
        const inteiro = ocorrencias(r, a, c)
        const partes = [...ocorrencias(r, a, b), ...(depoisDeB <= c ? ocorrencias(r, depoisDeB, c) : [])]
        expect(partes).toEqual(inteiro)
      }),
    )
  })

  it('3. sem deriva: mensal cai no dia pedido ou no último dia de um mês mais curto', () => {
    fc.assert(
      fc.property(regraArb.filter((r) => r.unit === 'mes'), (r) => {
        for (const o of ocorrencias(r, r.startDate, isoDate('2031-12-31'))) {
          const [ano, mes, dia] = o.nominal.split('-').map(Number)
          const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
          expect(dia === r.dayOfMonth || (dia === ultimo && ultimo < r.dayOfMonth!)).toBe(true)
        }
      }),
    )
  })

  it('4. próximo dia útil: nunca fim de semana, nunca antes, no máximo 2 dias depois', () => {
    fc.assert(
      fc.property(regraArb, janelaArb, (r, [de, ate]) => {
        for (const o of ocorrencias({ ...r, weekendPolicy: 'proximo_dia_util' }, de, ate)) {
          const diaSemana = new Date(o.vencimento + 'T00:00:00Z').getUTCDay()
          expect(diaSemana !== 0 && diaSemana !== 6).toBe(true)
          const atraso = (Date.parse(o.vencimento) - Date.parse(o.nominal)) / DIA
          expect(atraso >= 0 && atraso <= 2).toBe(true)
        }
      }),
    )
  })

  it('5. número de vezes nunca é ultrapassado, qualquer que seja a janela', () => {
    fc.assert(
      fc.property(regraArb.filter((r) => r.maxOccurrences !== null), janelaArb, (r, [de, ate]) => {
        const lista = ocorrencias(r, de, ate)
        expect(lista.every((o) => o.indice < r.maxOccurrences!)).toBe(true)
        expect(lista.length).toBeLessThanOrEqual(r.maxOccurrences!)
      }),
    )
  })
})

describe('proximaOcorrencia', () => {
  it('acha a próxima mesmo além do horizonte de geração', () => {
    const ipva = regra({ startDate: isoDate('2027-03-15'), unit: 'ano' })
    expect(proximaOcorrencia(ipva, isoDate('2026-10-25'))?.vencimento).toBe('2027-03-15')
    expect(proximaOcorrencia(ipva, isoDate('2027-03-16'))?.nominal).toBe('2028-03-15')
  })

  it('a cada 5 anos também', () => {
    const r = regra({ startDate: isoDate('2020-06-10'), unit: 'ano', interval: 5 })
    expect(proximaOcorrencia(r, isoDate('2026-10-25'))?.nominal).toBe('2030-06-10')
  })

  it('regra já terminada não tem próxima', () => {
    const r = regra({ startDate: isoDate('2026-01-05'), unit: 'mes', maxOccurrences: 2 })
    expect(proximaOcorrencia(r, isoDate('2026-10-25'))).toBeNull()
  })
})
