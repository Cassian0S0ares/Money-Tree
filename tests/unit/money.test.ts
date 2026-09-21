import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  ValorInvalidoError,
  addCents,
  cents,
  formatBRL,
  parseBRL,
  rateio,
  subCents,
  sumCents,
} from '../../src/domain/money'

describe('cents', () => {
  it('aceita inteiro', () => {
    expect(cents(123456)).toBe(123456)
  })

  it('rejeita fracionário, porque centavo quebrado é bug financeiro', () => {
    expect(() => cents(10.5)).toThrow(ValorInvalidoError)
  })

  it('rejeita NaN e Infinity', () => {
    expect(() => cents(Number.NaN)).toThrow(ValorInvalidoError)
    expect(() => cents(Number.POSITIVE_INFINITY)).toThrow(ValorInvalidoError)
  })
})

describe('parseBRL', () => {
  it.each([
    ['1.234,56', 123456],
    ['1234,56', 123456],
    ['0,05', 5],
    ['1.000.000,00', 100000000],
    ['R$ 1.234,56', 123456],
    ['10', 1000],
    ['10,5', 1050],
  ])('converte %s em %i centavos', (entrada, esperado) => {
    expect(parseBRL(entrada)).toBe(esperado)
  })

  it('rejeita entrada vazia ou sem número', () => {
    expect(() => parseBRL('')).toThrow(ValorInvalidoError)
    expect(() => parseBRL('abc')).toThrow(ValorInvalidoError)
  })

  it('rejeita mais de duas casas decimais em vez de arredondar em silêncio', () => {
    expect(() => parseBRL('10,555')).toThrow(ValorInvalidoError)
  })
})

describe('formatBRL', () => {
  it('formata em pt-BR', () => {
    //   é o espaço não separável que o Intl usa após "R$".
    expect(formatBRL(cents(123456))).toBe('R$ 1.234,56')
    expect(formatBRL(cents(-500))).toBe('-R$ 5,00')
    expect(formatBRL(cents(0))).toBe('R$ 0,00')
  })
})

describe('aritmética', () => {
  it('soma e subtrai', () => {
    expect(addCents(cents(100), cents(250))).toBe(350)
    expect(subCents(cents(100), cents(250))).toBe(-150)
    expect(sumCents([cents(1), cents(2), cents(3)])).toBe(6)
    expect(sumCents([])).toBe(0)
  })
})

describe('rateio', () => {
  it('distribui o resto em vez de perdê-lo', () => {
    expect(rateio(cents(100), 3)).toEqual([34, 33, 33])
  })

  it('funciona com valor negativo', () => {
    expect(rateio(cents(-100), 3)).toEqual([-34, -33, -33])
  })

  it('rejeita número de partes inválido', () => {
    expect(() => rateio(cents(100), 0)).toThrow(ValorInvalidoError)
  })

  it('INVARIANTE: a soma das partes é sempre o total', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100_000_000, max: 100_000_000 }),
        fc.integer({ min: 1, max: 500 }),
        (total, partes) => {
          const fatias = rateio(cents(total), partes)
          expect(fatias).toHaveLength(partes)
          expect(fatias.reduce((a, b) => a + b, 0)).toBe(total)
        },
      ),
    )
  })

  it('INVARIANTE: duas fatias nunca diferem em mais de um centavo', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.integer({ min: 1, max: 500 }),
        (total, partes) => {
          const fatias = rateio(cents(total), partes)
          expect(Math.max(...fatias) - Math.min(...fatias)).toBeLessThanOrEqual(1)
        },
      ),
    )
  })
})

describe('ida e volta', () => {
  it('INVARIANTE: formatar e reinterpretar devolve o mesmo valor', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }), (valor) => {
        expect(parseBRL(formatBRL(cents(valor)))).toBe(valor)
      }),
    )
  })
})
