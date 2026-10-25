import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { isoDate } from '../../src/domain/dates'
import { cents } from '../../src/domain/money'
import {
  ocorrencias,
  planejarEdicaoSerie,
  reservaMensal,
  tocada,
  valorIncomum,
  type OcorrenciaExistente,
  type RegraDatas,
} from '../../src/domain/recurrence'
import type { TransactionStatus } from '../../src/domain/types'

const mensal: RegraDatas = {
  startDate: isoDate('2026-01-05'),
  unit: 'mes',
  interval: 1,
  dayOfMonth: 5,
  endDate: null,
  maxOccurrences: null,
  weekendPolicy: 'manter',
}

function existentes(regra: RegraDatas, estados: TransactionStatus[], excecoes: number[] = []): OcorrenciaExistente[] {
  return ocorrencias(regra, regra.startDate, isoDate('2030-12-31'))
    .slice(0, estados.length)
    .map((o, i) => ({ id: `o${i}`, nominal: o.nominal, status: estados[i], isException: excecoes.includes(i) }))
}

describe('tocada', () => {
  it('só a prevista sem exceção pode ser substituída pela série', () => {
    expect(tocada({ id: 'a', nominal: isoDate('2026-01-05'), status: 'previsto', isException: false })).toBe(false)
    expect(tocada({ id: 'a', nominal: isoDate('2026-01-05'), status: 'previsto', isException: true })).toBe(true)
    for (const status of ['pendente', 'liquidado', 'conciliado', 'cancelado', 'estornado'] as const) {
      expect(tocada({ id: 'a', nominal: isoDate('2026-01-05'), status, isException: false })).toBe(true)
    }
  })
})

describe('planejarEdicaoSerie', () => {
  it('divide a regra na véspera e apaga só as futuras não tocadas', () => {
    const lista = existentes(mensal, ['liquidado', 'liquidado', 'previsto', 'cancelado', 'previsto', 'previsto'], [4])
    const plano = planejarEdicaoSerie({ regra: mensal, aPartirDe: isoDate('2026-03-05'), ocorrencias: lista })

    expect(plano).toEqual({ modo: 'dividir', fimDaAntiga: '2026-03-04', apagar: ['o2', 'o5'], restantes: null })
  })

  it('a partir da primeira ocorrência, substitui a regra em vez de dividir', () => {
    const lista = existentes(mensal, ['previsto', 'previsto'])
    const plano = planejarEdicaoSerie({ regra: mensal, aPartirDe: mensal.startDate, ocorrencias: lista })

    expect(plano).toEqual({ modo: 'substituir', apagar: ['o0', 'o1'], restantes: null })
  })

  it('a regra nova herda o que restava do número de vezes', () => {
    const doze = { ...mensal, maxOccurrences: 12 }
    const plano = planejarEdicaoSerie({ regra: doze, aPartirDe: isoDate('2026-04-05'), ocorrencias: [] })

    // Janeiro, fevereiro e março ficaram na antiga: restam 9 das 12.
    expect(plano.restantes).toBe(9)
  })

  it('INVARIANTE: nenhuma ocorrência tocada é apagada', () => {
    const estadoArb = fc.constantFrom<TransactionStatus>('previsto', 'pendente', 'liquidado', 'conciliado', 'cancelado', 'estornado')
    fc.assert(
      fc.property(
        fc.array(fc.record({ status: estadoArb, excecao: fc.boolean() }), { minLength: 1, maxLength: 24 }),
        fc.integer({ min: 0, max: 23 }),
        (geradas, corte) => {
          const lista = existentes(
            mensal,
            geradas.map((g) => g.status),
            geradas.flatMap((g, i) => (g.excecao ? [i] : [])),
          )
          const aPartirDe = lista[Math.min(corte, lista.length - 1)].nominal
          const plano = planejarEdicaoSerie({ regra: mensal, aPartirDe, ocorrencias: lista })

          for (const id of plano.apagar) {
            const ocorrencia = lista.find((o) => o.id === id)!
            expect(tocada(ocorrencia)).toBe(false)
            expect(ocorrencia.nominal >= aPartirDe).toBe(true)
          }
        },
      ),
    )
  })
})

describe('valorIncomum', () => {
  const historico = [cents(23_850), cents(24_100), cents(22_900)]

  it('sem três pagamentos anteriores, não há aviso', () => {
    expect(valorIncomum(cents(99_999), [])).toBeNull()
    expect(valorIncomum(cents(99_999), historico.slice(0, 2))).toBeNull()
  })

  it('avisa acima de 25% da mediana, para cima ou para baixo', () => {
    expect(valorIncomum(cents(31_240), historico)).toEqual({ percentual: 31, mediana: 23_850, sentido: 'acima' })
    expect(valorIncomum(cents(15_000), historico)).toEqual({ percentual: 37, mediana: 23_850, sentido: 'abaixo' })
  })

  it('exatamente 25% não avisa; um centavo além, avisa', () => {
    const base = [cents(10_000), cents(10_000), cents(10_000)]
    expect(valorIncomum(cents(12_500), base)).toBeNull()
    expect(valorIncomum(cents(12_501), base)).not.toBeNull()
  })

  it('usa só os três mais recentes, e mediana, não média', () => {
    // Um mês atípico não arrasta a referência.
    expect(valorIncomum(cents(10_000), [cents(10_000), cents(90_000), cents(10_200), cents(1)])).toBeNull()
  })

  it('mediana zero não divide por zero', () => {
    expect(valorIncomum(cents(100), [cents(0), cents(0), cents(5)])).toBeNull()
  })
})

describe('reservaMensal', () => {
  it('o exemplo da spec: R$ 1.200 em 15 de março, a partir de 25 de outubro', () => {
    expect(reservaMensal(cents(120_000), isoDate('2026-10-25'), isoDate('2027-03-15'))).toEqual({
      meses: 5,
      porMes: 24_000,
    })
  })

  it('vencimento hoje ou no passado não sugere reserva', () => {
    expect(reservaMensal(cents(100), isoDate('2026-10-25'), isoDate('2026-10-25'))).toBeNull()
  })

  it('INVARIANTE: a reserva sempre basta e é inteira em centavos', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000_000 }),
        fc.integer({ min: 1, max: 800 }),
        (valor, dias) => {
          const hoje = isoDate('2026-10-25')
          const vencimento = isoDate(new Date(Date.parse(hoje) + dias * 86_400_000).toISOString().slice(0, 10))
          const reserva = reservaMensal(cents(valor), hoje, vencimento)!

          expect(Number.isInteger(reserva.porMes)).toBe(true)
          expect(reserva.meses).toBeGreaterThanOrEqual(1)
          expect(reserva.porMes * reserva.meses).toBeGreaterThanOrEqual(valor)
          // Arredonda para cima, mas não mais que um centavo por mês.
          expect(reserva.porMes * reserva.meses - valor).toBeLessThan(reserva.meses)
        },
      ),
    )
  })
})
