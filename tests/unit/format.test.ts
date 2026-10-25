import { describe, expect, it } from 'vitest'
import { dataCurta, dataLonga, dinheiro, rotuloStatus } from '../../src/lib/format'
import { cents } from '../../src/domain/money'
import { isoDate } from '../../src/domain/dates'

describe('formatação pt-BR', () => {
  it('formata dinheiro', () => {
    expect(dinheiro(cents(123456))).toBe('R$ 1.234,56')
  })

  it('formata data sem deslocar por fuso', () => {
    // O bug clássico: new Date('2026-09-18') é meia-noite UTC, que em
    // São Paulo é dia 17. A formatação precisa tratar como data civil.
    expect(dataCurta(isoDate('2026-09-18'))).toBe('18/09/2026')
    expect(dataCurta(isoDate('2026-01-01'))).toBe('01/01/2026')
  })

  it('formata data longa em pt-BR', () => {
    expect(dataLonga(isoDate('2026-09-18'))).toBe('18 de setembro de 2026')
  })
})

describe('rotuloStatus', () => {
  it('atrasado tem texto próprio, não só cor', () => {
    const rotulo = rotuloStatus('previsto', true)
    expect(rotulo.texto).toBe('Atrasado')
    expect(rotulo.icone).not.toBe('')
  })

  it('cada estado tem texto legível', () => {
    const estados = ['previsto', 'pendente', 'liquidado', 'conciliado', 'cancelado', 'estornado'] as const
    for (const estado of estados) {
      const rotulo = rotuloStatus(estado, false)
      expect(rotulo.texto.length).toBeGreaterThan(0)
      expect(rotulo.icone.length).toBeGreaterThan(0)
    }
  })
})

describe('valorParaEntrada', () => {
  it('devolve o formato que parseBRL aceita, ida e volta exata', async () => {
    const { parseBRL } = await import('../../src/domain/money')
    const { valorParaEntrada } = await import('../../src/lib/format')
    for (const valor of [0, 5, 99, 100, 123_456, -35_000, 100_000_007]) {
      expect(parseBRL(valorParaEntrada(cents(valor)))).toBe(valor)
    }
    expect(valorParaEntrada(cents(123_456))).toBe('1.234,56')
    expect(valorParaEntrada(cents(-5))).toBe('-0,05')
  })
})
