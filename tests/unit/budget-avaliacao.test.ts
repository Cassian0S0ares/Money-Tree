import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { isoDate } from '../../src/domain/dates'
import { cents } from '../../src/domain/money'
import { avaliar } from '../../src/domain/budget'

// Outubro: 31 dias.
const outubro = { inicio: isoDate('2026-10-01'), fim: isoDate('2026-10-31') }

function entrada(parcial: Partial<Parameters<typeof avaliar>[0]> = {}) {
  return {
    disponivel: cents(62_000),
    realizado: cents(0),
    realizadoVariavel: cents(0),
    comprometido: cents(0),
    periodo: outubro,
    hoje: isoDate('2026-10-15'),
    ...parcial,
  }
}

describe('ritmo', () => {
  // Dia 15 de 31: esperado = 62.000 × 15/31 = 30.000; tolerância 6.200.
  it('calcula o esperado para hoje, contando o dia de hoje', () => {
    expect(avaliar(entrada()).esperadoHoje).toBe(30_000)
  })

  it.each([
    [23_799, 'abaixo'],
    [23_800, 'no_ritmo'],
    [36_200, 'no_ritmo'],
    [36_201, 'acima'],
  ])('realizado %i fica %s do ritmo', (realizado, ritmo) => {
    expect(avaliar(entrada({ realizado: cents(realizado) })).ritmo).toBe(ritmo)
  })

  it('período passado não tem ritmo nem previsão; tem resultado', () => {
    const r = avaliar(entrada({ realizado: cents(70_000), hoje: isoDate('2026-11-10') }))
    expect(r.ritmo).toBeNull()
    expect(r.previsto).toBeNull()
    expect(r.situacao).toBe('estourado')
  })

  it('período futuro também não', () => {
    const r = avaliar(entrada({ comprometido: cents(10_000), hoje: isoDate('2026-09-20') }))
    expect(r.ritmo).toBeNull()
    expect(r.previsto).toBeNull()
  })
})

describe('previsão de estouro', () => {
  it('não aparece antes do 7º dia; aparece no 7º', () => {
    const base = { realizado: cents(20_000), realizadoVariavel: cents(20_000) }
    expect(avaliar(entrada({ ...base, hoje: isoDate('2026-10-06') })).previsto).toBeNull()
    expect(avaliar(entrada({ ...base, hoje: isoDate('2026-10-07') })).previsto).not.toBeNull()
  })

  it('projeta só o variável: o aluguel pago no dia 5 não se repete', () => {
    // Dia 10: 50.000 fixo (aluguel) + 5.000 variável. Taxa 500/dia × 21 dias = 10.500.
    const r = avaliar(entrada({
      disponivel: cents(70_000), realizado: cents(55_000), realizadoVariavel: cents(5_000),
      hoje: isoDate('2026-10-10'),
    }))
    expect(r.previsto).toBe(65_500)
    expect(r.estouroPrevisto).toBe(0)
    expect(r.situacao).not.toBe('vai_estourar')
  })

  it('soma o comprometido, que já é conhecido, sem projetá-lo', () => {
    const r = avaliar(entrada({
      realizado: cents(10_000), realizadoVariavel: cents(10_000), comprometido: cents(8_000),
      hoje: isoDate('2026-10-10'),
    }))
    // 10.000 + 8.000 + 1.000/dia × 21 = 39.000
    expect(r.previsto).toBe(39_000)
  })

  it('avisa quanto vai estourar', () => {
    const r = avaliar(entrada({
      disponivel: cents(30_000), realizado: cents(20_000), realizadoVariavel: cents(20_000),
      hoje: isoDate('2026-10-10'),
    }))
    // 20.000 + 2.000/dia × 21 = 62.000 → estoura 32.000
    expect(r.estouroPrevisto).toBe(32_000)
    expect(r.situacao).toBe('vai_estourar')
  })
})

describe('situação', () => {
  it('dentro, quando nada pede atenção', () => {
    expect(avaliar(entrada({ realizado: cents(28_000) })).situacao).toBe('dentro')
  })

  it('atenção: comprometido passa do limite, antes de haver previsão', () => {
    const r = avaliar(entrada({ realizado: cents(1_000), comprometido: cents(70_000), hoje: isoDate('2026-10-03') }))
    expect(r).toMatchObject({ situacao: 'atencao', motivo: 'comprometido' })
  })

  it('atenção: acima do ritmo sem previsão de estouro', () => {
    const r = avaliar(entrada({ realizado: cents(40_000), realizadoVariavel: cents(0) }))
    expect(r).toMatchObject({ situacao: 'atencao', motivo: 'ritmo' })
  })

  it('estourado vence tudo', () => {
    expect(avaliar(entrada({ realizado: cents(62_001) })).situacao).toBe('estourado')
  })

  it('limite zero: qualquer gasto estoura, e não há percentual', () => {
    const zero = avaliar(entrada({ disponivel: cents(0) }))
    expect(zero).toMatchObject({ situacao: 'dentro', percentual: null })
    expect(avaliar(entrada({ disponivel: cents(0), realizado: cents(1) })).situacao).toBe('estourado')
  })

  it('restante desconta realizado e comprometido', () => {
    const r = avaliar(entrada({ realizado: cents(20_000), comprometido: cents(5_000) }))
    expect(r.restante).toBe(37_000)
    expect(r.percentual).toBe(32)
  })
})

describe('invariante 3 (spec 6.6)', () => {
  it('previsto ≥ realizado + comprometido; sem gasto variável, é igual', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 7, max: 31 }),
        (fixo, variavel, comprometido, dia) => {
          const hoje = isoDate(`2026-10-${String(dia).padStart(2, '0')}`)
          const base = { realizado: cents(fixo + variavel), comprometido: cents(comprometido), hoje }

          const r = avaliar(entrada({ ...base, realizadoVariavel: cents(variavel) }))
          expect(r.previsto!).toBeGreaterThanOrEqual(fixo + variavel + comprometido)
          expect(Number.isInteger(r.previsto)).toBe(true)

          const semVariavel = avaliar(entrada({ ...base, realizadoVariavel: cents(0) }))
          expect(semVariavel.previsto).toBe(fixo + variavel + comprometido)
        },
      ),
    )
  })
})
