import { describe, expect, it } from 'vitest'
import {
  DataInvalidaError,
  comparaDatas,
  hojeEm,
  isoDate,
  mesFinanceiro,
} from '../../src/domain/dates'

describe('isoDate', () => {
  it('aceita AAAA-MM-DD', () => {
    expect(isoDate('2026-09-18')).toBe('2026-09-18')
  })

  it.each(['18/09/2026', '2026-9-8', '2026-13-01', '2026-02-30', ''])(
    'rejeita %s',
    (entrada) => {
      expect(() => isoDate(entrada)).toThrow(DataInvalidaError)
    },
  )
})

describe('hojeEm', () => {
  it('usa o fuso do usuário, não o do servidor', () => {
    // 2026-09-19T02:00:00Z ainda é 18 de setembro em São Paulo (UTC-3).
    const instante = new Date('2026-09-19T02:00:00Z')
    expect(hojeEm('America/Sao_Paulo', instante)).toBe('2026-09-18')
    expect(hojeEm('UTC', instante)).toBe('2026-09-19')
  })
})

describe('comparaDatas', () => {
  it('ordena cronologicamente', () => {
    expect(comparaDatas(isoDate('2026-01-01'), isoDate('2026-02-01'))).toBeLessThan(0)
    expect(comparaDatas(isoDate('2026-02-01'), isoDate('2026-01-01'))).toBeGreaterThan(0)
    expect(comparaDatas(isoDate('2026-01-01'), isoDate('2026-01-01'))).toBe(0)
  })
})

describe('mesFinanceiro', () => {
  it('com início no dia 1, é o mês civil', () => {
    expect(mesFinanceiro(isoDate('2026-09-18'), 1)).toEqual({
      inicio: '2026-09-01',
      fim: '2026-09-30',
    })
  })

  it('com início no dia 5, o período atravessa a virada do mês', () => {
    expect(mesFinanceiro(isoDate('2026-09-18'), 5)).toEqual({
      inicio: '2026-09-05',
      fim: '2026-10-04',
    })
  })

  it('antes do dia de início, o período é o anterior', () => {
    expect(mesFinanceiro(isoDate('2026-09-03'), 5)).toEqual({
      inicio: '2026-08-05',
      fim: '2026-09-04',
    })
  })

  it('início no dia 31 cai no último dia dos meses curtos', () => {
    expect(mesFinanceiro(isoDate('2026-03-15'), 31)).toEqual({
      inicio: '2026-02-28',
      fim: '2026-03-30',
    })
  })

  it('rejeita dia de início fora de 1..31', () => {
    expect(() => mesFinanceiro(isoDate('2026-09-18'), 0)).toThrow(DataInvalidaError)
    expect(() => mesFinanceiro(isoDate('2026-09-18'), 32)).toThrow(DataInvalidaError)
  })
})
