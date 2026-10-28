import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { isoDate } from '../../src/domain/dates'
import { cents } from '../../src/domain/money'
import type { Cents } from '../../src/domain/types'
import {
  contribuicaoNecessaria,
  mesesRestantes,
  mesProvavel,
  progresso,
  reservaParaDesconto,
  ritmo,
  type Movimento,
  type Ritmo,
} from '../../src/domain/goal'

describe('progresso', () => {
  it('falta é o que resta até o alvo; percentual trunca para baixo', () => {
    expect(progresso(cents(10_000_00), cents(3_200_00))).toEqual({
      falta: 6_800_00,
      percentual: 32,
      atingida: false,
    })
  })

  it('reservado acima do alvo: falta zero, percentual travado em 100, atingida', () => {
    expect(progresso(cents(10_000_00), cents(12_000_00))).toEqual({
      falta: 0,
      percentual: 100,
      atingida: true,
    })
  })

  it('reservado igual ao alvo: atingida', () => {
    expect(progresso(cents(5_000_00), cents(5_000_00))).toEqual({
      falta: 0,
      percentual: 100,
      atingida: true,
    })
  })
})

describe('mesesRestantes', () => {
  it('month_start_day 1: data-alvo no período atual conta 1', () => {
    expect(mesesRestantes(isoDate('2026-10-15'), isoDate('2026-10-25'), 1)).toBe(1)
  })

  it('month_start_day 1: data-alvo em janeiro conta cada período até lá', () => {
    // Out, Nov, Dez, Jan = 4 períodos a partir do atual.
    expect(mesesRestantes(isoDate('2026-10-15'), isoDate('2027-01-10'), 1)).toBe(4)
  })

  it('month_start_day 5: data-alvo no período atual (vira em 05) conta 1, mesmo no último dia', () => {
    expect(mesesRestantes(isoDate('2026-10-15'), isoDate('2026-10-20'), 5)).toBe(1)
    expect(mesesRestantes(isoDate('2026-10-15'), isoDate('2026-11-04'), 5)).toBe(1)
  })

  it('month_start_day 5: data-alvo no início do próximo período conta 2', () => {
    expect(mesesRestantes(isoDate('2026-10-15'), isoDate('2026-11-05'), 5)).toBe(2)
  })

  it('data-alvo antes de hoje conta 0, mesmo dentro do período atual (prazo vencido)', () => {
    expect(mesesRestantes(isoDate('2026-10-15'), isoDate('2026-10-01'), 1)).toBe(0)
  })

  it('data-alvo em período inteiramente passado conta 0', () => {
    expect(mesesRestantes(isoDate('2026-10-15'), isoDate('2026-09-01'), 1)).toBe(0)
  })
})

describe('contribuicaoNecessaria', () => {
  it('arredonda para cima', () => {
    expect(contribuicaoNecessaria(cents(1_000), 3)).toBe(334)
  })

  it('divisão exata não arredonda além do necessário', () => {
    expect(contribuicaoNecessaria(cents(900), 3)).toBe(300)
  })

  it('falta zero: necessária zero', () => {
    expect(contribuicaoNecessaria(cents(0), 3)).toBe(0)
  })

  it('meses <= 0: nula (sem data-alvo ou prazo vencido)', () => {
    expect(contribuicaoNecessaria(cents(1_000), 0)).toBeNull()
    expect(contribuicaoNecessaria(cents(1_000), -1)).toBeNull()
  })
})

describe('ritmo', () => {
  const hoje = isoDate('2026-10-15')
  const diaInicio = 1

  // Convenção da spec 4.2: aporte é positivo; resgate e liberação, negativos.
  // O chamador passa a magnitude; o helper aplica o sinal certo.
  const mov = (magnitudeCents: number, kind: Movimento['kind'], occurredOn: string): Movimento => ({
    amountCents: cents(kind === 'aporte' ? magnitudeCents : -magnitudeCents),
    kind,
    occurredOn: isoDate(occurredOn),
    accountId: 'conta-1',
  })

  it('planejado positivo vence, mesmo com movimentos', () => {
    const movimentos = [mov(100_00, 'aporte', '2026-09-10')]
    expect(ritmo(cents(500_00), movimentos, hoje, diaInicio)).toEqual({ origem: 'planejado', valor: 500_00 })
  })

  it('sem planejado: média líquida dos três últimos períodos completos (aporte e resgate, sem liberação)', () => {
    const movimentos = [
      mov(300_00, 'aporte', '2026-07-10'), // jul: +300
      mov(300_00, 'aporte', '2026-08-10'), // ago: +300 - 100 = +200
      mov(100_00, 'resgate', '2026-08-20'),
      mov(400_00, 'aporte', '2026-09-05'), // set: +400
      mov(999_999_00, 'liberacao', '2026-09-28'), // ignorado
    ]
    // soma = 300+200+400 = 900; média = 300
    expect(ritmo(null, movimentos, hoje, diaInicio)).toEqual({ origem: 'media', valor: 300_00 })
  })

  it('trunca a média em direção a zero quando a divisão não é exata', () => {
    // Só um aporte de 100 centavos num dos três períodos: soma 100, /3 = 33,33 → 33.
    const movimentos = [mov(100, 'aporte', '2026-09-05')]
    expect(ritmo(null, movimentos, hoje, diaInicio)).toEqual({ origem: 'media', valor: 33 })
  })

  it('movimento do período atual fica fora da média', () => {
    const movimentos = [
      mov(300_00, 'aporte', '2026-07-10'),
      mov(200_00, 'aporte', '2026-08-10'),
      mov(400_00, 'aporte', '2026-09-05'),
      mov(999_999_00, 'aporte', '2026-10-05'), // período atual, ignorado
    ]
    expect(ritmo(null, movimentos, hoje, diaInicio)).toEqual({ origem: 'media', valor: 300_00 })
  })

  it('média líquida negativa ou zero: sem ritmo', () => {
    const movimentos = [
      mov(100_00, 'aporte', '2026-09-10'),
      mov(400_00, 'resgate', '2026-09-15'),
    ]
    expect(ritmo(null, movimentos, hoje, diaInicio)).toBeNull()
  })

  it('sem movimentos nos três últimos períodos e sem planejado: sem ritmo', () => {
    expect(ritmo(null, [], hoje, diaInicio)).toBeNull()
  })
})

describe('mesProvavel', () => {
  const hoje = isoDate('2026-10-15')
  const diaInicio = 1

  it('falta zero: período atual, mesmo sem ritmo', () => {
    expect(mesProvavel(cents(0), null, hoje, diaInicio)).toEqual({ inicio: '2026-10-01', fim: '2026-10-31' })
  })

  it('sem ritmo e falta positiva: nulo', () => {
    expect(mesProvavel(cents(1_000), null, hoje, diaInicio)).toBeNull()
  })

  it('falta cabe no ritmo do período atual', () => {
    const r: Ritmo = { origem: 'media', valor: cents(500_00) }
    expect(mesProvavel(cents(500_00), r, hoje, diaInicio)).toEqual({ inicio: '2026-10-01', fim: '2026-10-31' })
  })

  it('falta exige mais períodos', () => {
    const r: Ritmo = { origem: 'media', valor: cents(500_00) }
    expect(mesProvavel(cents(1_000_00), r, hoje, diaInicio)).toEqual({ inicio: '2026-11-01', fim: '2026-11-30' })
  })
})

describe('reservaParaDesconto', () => {
  it('soma só as reservas de contas incluídas no disponível', () => {
    const reservas = new Map<string, Cents>([
      ['c1', cents(100_00)],
      ['c2', cents(200_00)],
      ['c3', cents(50_00)],
    ])
    const contas = [
      { id: 'c1', includeInAvailable: true },
      { id: 'c2', includeInAvailable: false },
      { id: 'c3', includeInAvailable: true },
    ]
    expect(reservaParaDesconto(reservas, contas)).toBe(150_00)
  })

  it('reserva em conta sem entrada no mapa de contas não é somada', () => {
    const reservas = new Map<string, Cents>([['fantasma', cents(999_00)]])
    expect(reservaParaDesconto(reservas, [])).toBe(0)
  })
})

describe('invariantes (spec 6.8)', () => {
  it('1. reservaParaDesconto soma só as incluídas; mudar reserva de conta excluída não muda o total', () => {
    const contaArb = fc.record({ includeInAvailable: fc.boolean(), valor: fc.integer({ min: 0, max: 1_000_000 }) })
    fc.assert(
      fc.property(fc.array(contaArb, { maxLength: 8 }), fc.integer({ min: 0, max: 1_000_000 }), (lista, outroValor) => {
        const contas = lista.map((c, i) => ({ id: `c${i}`, includeInAvailable: c.includeInAvailable }))
        const reservas = new Map<string, Cents>(lista.map((c, i) => [`c${i}`, cents(c.valor)]))
        const esperado = lista.filter((c) => c.includeInAvailable).reduce((s, c) => s + c.valor, 0)
        expect(reservaParaDesconto(reservas, contas)).toBe(esperado)

        const excluidaIdx = lista.findIndex((c) => !c.includeInAvailable)
        if (excluidaIdx >= 0) {
          const alterado = new Map(reservas)
          alterado.set(`c${excluidaIdx}`, cents(outroValor))
          expect(reservaParaDesconto(alterado, contas)).toBe(reservaParaDesconto(reservas, contas))
        }
      }),
    )
  })

  it('2. necessária fecha: necessaria × meses >= falta e (necessaria - 1) × meses < falta', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), fc.integer({ min: 1, max: 360 }), (falta, meses) => {
        const necessaria = contribuicaoNecessaria(cents(falta), meses)!
        expect(necessaria * meses).toBeGreaterThanOrEqual(falta)
        expect((necessaria - 1) * meses).toBeLessThan(falta)
      }),
    )
  })

  it('3. contribuição maior nunca dá mês provável posterior', () => {
    fc.assert(
      fc.property(
        // Faixas pequenas de propósito: ritmo baixo com falta grande geraria
        // mesProvavel décadas no futuro, estourando o ano de 4 dígitos do IsoDate.
        fc.integer({ min: 0, max: 500_000 }),
        fc.integer({ min: 10_000, max: 500_000 }),
        fc.integer({ min: 0, max: 500_000 }),
        fc.integer({ min: 1, max: 28 }),
        (falta, menorValor, delta, diaInicio) => {
          const hoje = isoDate('2026-10-15')
          const menor: Ritmo = { origem: 'media', valor: cents(menorValor) }
          const maior: Ritmo = { origem: 'media', valor: cents(menorValor + delta) }
          const pMenor = mesProvavel(cents(falta), menor, hoje, diaInicio)!
          const pMaior = mesProvavel(cents(falta), maior, hoje, diaInicio)!
          expect(pMaior.inicio <= pMenor.inicio).toBe(true)
        },
      ),
    )
  })

  it('6. percentual entre 0 e 100 e falta >= 0', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10_000_000 }), fc.integer({ min: 0, max: 20_000_000 }), (alvo, reservado) => {
        const { falta, percentual } = progresso(cents(alvo), cents(reservado))
        expect(percentual).toBeGreaterThanOrEqual(0)
        expect(percentual).toBeLessThanOrEqual(100)
        expect(falta).toBeGreaterThanOrEqual(0)
      }),
    )
  })
})
