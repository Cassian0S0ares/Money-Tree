import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { isoDate, somarDias } from '../../src/domain/dates'
import { cents } from '../../src/domain/money'
import type { Cents, IsoDate } from '../../src/domain/types'
import { avaliarMeta, simular, type Movimento } from '../../src/domain/goal'

const hoje = isoDate('2026-10-15')
const diaInicio = 1

function entrada(parcial: Partial<Parameters<typeof avaliarMeta>[0]> = {}) {
  return {
    alvo: cents(10_000_00),
    reservado: cents(0),
    dataAlvo: null as IsoDate | null,
    planejado: null as Cents | null,
    movimentos: [] as Movimento[],
    hoje,
    diaInicio,
    ...parcial,
  }
}

describe('avaliarMeta: atingida', () => {
  it('reservado >= alvo: atingida, sem opções', () => {
    const r = avaliarMeta(entrada({ reservado: cents(10_000_00) }))
    expect(r.situacao).toBe('atingida')
    expect(r.atingida).toBe(true)
    expect(r.opcoes).toBeNull()
  })

  it('atingida vence mesmo com data-alvo no passado', () => {
    const r = avaliarMeta(entrada({ reservado: cents(10_000_00), dataAlvo: isoDate('2020-01-01') }))
    expect(r.situacao).toBe('atingida')
  })
})

describe('avaliarMeta: sem prazo', () => {
  it('sem data-alvo: sem_prazo, mesesRestantes e opções nulos', () => {
    const r = avaliarMeta(entrada({ reservado: cents(2_000_00) }))
    expect(r.situacao).toBe('sem_prazo')
    expect(r.mesesRestantes).toBeNull()
    expect(r.necessaria).toBeNull()
    expect(r.opcoes).toBeNull()
    expect(r.faltariaNaData).toBeNull()
    expect(r.mesesDeAtraso).toBeNull()
  })

  it('sem data-alvo e sem ritmo não vira fora_do_prazo', () => {
    const r = avaliarMeta(entrada({ reservado: cents(2_000_00), movimentos: [] }))
    expect(r.situacao).toBe('sem_prazo')
  })
})

describe('avaliarMeta: prazo vencido', () => {
  it('data-alvo no passado e falta > 0: prazo_vencido, mesesRestantes 0, necessaria nula', () => {
    const r = avaliarMeta(entrada({ reservado: cents(2_000_00), dataAlvo: isoDate('2026-09-01') }))
    expect(r.situacao).toBe('prazo_vencido')
    expect(r.mesesRestantes).toBe(0)
    expect(r.necessaria).toBeNull()
  })

  it('opções: aumentarContribuicao e reduzirAlvo nulos; mudarData nula sem ritmo', () => {
    const r = avaliarMeta(entrada({ reservado: cents(2_000_00), dataAlvo: isoDate('2026-09-01') }))
    expect(r.opcoes).toEqual({ aumentarContribuicao: null, reduzirAlvo: null, mudarData: null })
  })

  it('com ritmo (planejado): mudarData = fim do mês provável', () => {
    const r = avaliarMeta(
      entrada({ reservado: cents(2_000_00), dataAlvo: isoDate('2026-09-01'), planejado: cents(1_000_00) }),
    )
    // falta = 8.000; ritmo 1.000/mês => 8 meses a partir do período atual (out) => maio/2027
    expect(r.opcoes?.aumentarContribuicao).toBeNull()
    expect(r.opcoes?.reduzirAlvo).toBeNull()
    expect(r.opcoes?.mudarData).not.toBeNull()
    expect(r.mesProvavel).not.toBeNull()
    expect(r.opcoes?.mudarData).toBe(r.mesProvavel?.fim)
  })

  it('faltariaNaData = falta inteira (mesesRestantes é 0)', () => {
    const r = avaliarMeta(
      entrada({ reservado: cents(2_000_00), dataAlvo: isoDate('2026-09-01'), planejado: cents(1_000_00) }),
    )
    expect(r.faltariaNaData).toBe(8_000_00)
  })

  it('mesesDeAtraso é nulo em prazo vencido', () => {
    const r = avaliarMeta(
      entrada({ reservado: cents(2_000_00), dataAlvo: isoDate('2026-09-01'), planejado: cents(1_000_00) }),
    )
    expect(r.mesesDeAtraso).toBeNull()
  })
})

describe('avaliarMeta: fora do prazo', () => {
  it('sem ritmo e falta > 0: fora_do_prazo', () => {
    const r = avaliarMeta(entrada({ reservado: cents(2_000_00), dataAlvo: isoDate('2027-01-10') }))
    expect(r.situacao).toBe('fora_do_prazo')
    expect(r.opcoes).toEqual({ aumentarContribuicao: r.necessaria, reduzirAlvo: 2_000_00, mudarData: null })
    expect(r.faltariaNaData).toBe(r.falta)
    expect(r.mesesDeAtraso).toBeNull()
  })

  it('mês provável começa depois da data-alvo: fora_do_prazo', () => {
    // falta = 8.000 (alvo 10.000, reservado 2.000); ritmo 1.000/mês -> 8 meses -> maio/2027.
    // data-alvo em novembro/2026: o mês provável começa bem depois.
    const r = avaliarMeta(
      entrada({
        reservado: cents(2_000_00),
        dataAlvo: isoDate('2026-11-15'),
        planejado: cents(1_000_00),
      }),
    )
    expect(r.situacao).toBe('fora_do_prazo')
    expect(r.mesProvavel!.inicio > isoDate('2026-11-15')).toBe(true)
  })

  it('opções: aumentarContribuicao = necessaria; reduzirAlvo = reservado + ritmo × mesesRestantes; mudarData = fim do mês provável', () => {
    const r = avaliarMeta(
      entrada({
        reservado: cents(2_000_00),
        dataAlvo: isoDate('2026-11-15'),
        planejado: cents(1_000_00),
      }),
    )
    expect(r.opcoes?.aumentarContribuicao).toBe(r.necessaria)
    expect(r.opcoes?.reduzirAlvo).toBe(2_000_00 + 1_000_00 * r.mesesRestantes!)
    expect(r.opcoes?.mudarData).toBe(r.mesProvavel?.fim)
  })

  it('faltariaNaData = max(0, falta - ritmo × mesesRestantes)', () => {
    const r = avaliarMeta(
      entrada({
        reservado: cents(2_000_00),
        dataAlvo: isoDate('2026-11-15'),
        planejado: cents(1_000_00),
      }),
    )
    const esperado = Math.max(0, 8_000_00 - 1_000_00 * r.mesesRestantes!)
    expect(r.faltariaNaData).toBe(esperado)
  })

  it('mesesDeAtraso conta períodos entre o período da data-alvo e o mês provável', () => {
    const r = avaliarMeta(
      entrada({
        reservado: cents(2_000_00),
        dataAlvo: isoDate('2026-11-15'),
        planejado: cents(1_000_00),
      }),
    )
    expect(r.mesesDeAtraso).toBeGreaterThan(0)
  })
})

describe('avaliarMeta: no prazo', () => {
  // falta = 8.000; ritmo 1.000/mês -> 8 meses a partir de out (período atual) -> maio/2027
  // (início 01/05, fim 31/05). Fix de 6.4 (commit c7660c6, spec 3.4 é vinculante): o
  // período que contém a data-alvo conta como mês de contribuição por inteiro, então a
  // borda é o *início* do mês provável, não o fim.

  it('data-alvo igual ao início do mês provável: no_prazo (borda)', () => {
    const r = avaliarMeta(
      entrada({
        reservado: cents(2_000_00),
        dataAlvo: isoDate('2027-05-01'),
        planejado: cents(1_000_00),
      }),
    )
    expect(r.mesProvavel).toEqual({ inicio: '2027-05-01', fim: '2027-05-31' })
    expect(r.situacao).toBe('no_prazo')
    expect(r.opcoes).toBeNull()
    expect(r.faltariaNaData).toBeNull()
    expect(r.mesesDeAtraso).toBeNull()
  })

  it('data-alvo um dia antes do início do mês provável: fora_do_prazo (borda)', () => {
    const r = avaliarMeta(
      entrada({
        reservado: cents(2_000_00),
        dataAlvo: isoDate('2027-04-30'),
        planejado: cents(1_000_00),
      }),
    )
    expect(r.mesProvavel).toEqual({ inicio: '2027-05-01', fim: '2027-05-31' })
    expect(r.situacao).toBe('fora_do_prazo')
  })

  it('data-alvo bem depois do mês provável: no_prazo', () => {
    const r = avaliarMeta(
      entrada({
        reservado: cents(2_000_00),
        dataAlvo: isoDate('2030-01-01'),
        planejado: cents(1_000_00),
      }),
    )
    expect(r.situacao).toBe('no_prazo')
  })
})

describe('simular', () => {
  const base = { alvo: cents(10_000_00), reservado: cents(2_000_00), hoje, diaInicio }

  it('não depende de movimentos: usa a contribuição dada como ritmo planejado', () => {
    const r = simular({ ...base, dataAlvo: null }, cents(1_000_00))
    expect(r.mesProvavel).toEqual({ inicio: '2027-05-01', fim: '2027-05-31' })
  })

  it('sem data-alvo: mesesDeDiferenca e faltariaNaData nulos', () => {
    const r = simular({ ...base, dataAlvo: null }, cents(1_000_00))
    expect(r.mesesDeDiferenca).toBeNull()
    expect(r.faltariaNaData).toBeNull()
  })

  it('contribuição <= 0: mesesDeDiferenca nulo; mesProvavel nulo (falta > 0)', () => {
    const r = simular({ ...base, dataAlvo: isoDate('2027-05-31') }, cents(0))
    expect(r.mesesDeDiferenca).toBeNull()
    expect(r.mesProvavel).toBeNull()
  })

  it('contribuição <= 0 mas falta zero: mesProvavel é o período atual', () => {
    const r = simular({ ...base, reservado: cents(10_000_00), dataAlvo: isoDate('2027-05-31') }, cents(0))
    expect(r.mesProvavel).toEqual({ inicio: '2026-10-01', fim: '2026-10-31' })
    expect(r.mesesDeDiferenca).toBeNull()
  })

  it('mesesDeDiferenca positivo quando conclui depois da data-alvo', () => {
    const r = simular({ ...base, dataAlvo: isoDate('2026-11-15') }, cents(1_000_00))
    expect(r.mesesDeDiferenca).toBeGreaterThan(0)
  })

  it('mesesDeDiferenca negativo quando conclui antes da data-alvo', () => {
    const r = simular({ ...base, dataAlvo: isoDate('2030-01-01') }, cents(1_000_00))
    expect(r.mesesDeDiferenca).toBeLessThan(0)
  })

  it('mesesDeDiferenca zero: mesmo período que a data-alvo', () => {
    const r = simular({ ...base, dataAlvo: isoDate('2027-05-20') }, cents(1_000_00))
    expect(r.mesesDeDiferenca).toBe(0)
  })

  it('faltariaNaData = max(0, falta - contribuição × mesesRestantes)', () => {
    const r = simular({ ...base, dataAlvo: isoDate('2026-11-15') }, cents(1_000_00))
    // mesesRestantes de hoje (15/10) até 15/11, dia_inicio 1 = 2 períodos (out, nov)
    expect(r.faltariaNaData).toBe(Math.max(0, 8_000_00 - 1_000_00 * 2))
  })
})

// Fix de 6.4 (commit c7660c6): spec 3.4 é vinculante — o período que contém a
// data-alvo conta como mês de contribuição por inteiro, então "fora do prazo"
// é o mês provável *começar* depois da data-alvo (não terminar depois dela).
// Com essa regra, aumentar a contribuição e reduzir o alvo pousam o mês
// provável em um período de índice <= o da data-alvo (necessaria e
// reduzirAlvo fecham, no pior caso, exatamente nos meses restantes), então a
// propriedade vale para qualquer data-alvo, inclusive no meio de um período —
// não precisa mais restringir ao fim do período.
function dataAlvoDaquiA(diasAFrente: number): string {
  return somarDias(hoje, diasAFrente)
}

describe('invariantes (spec 6.8, propriedade 5)', () => {
  it('5. aplicar qualquer opção de meta fora do prazo resolve a situação (data-alvo em qualquer dia do período)', () => {
    fc.assert(
      fc.property(
        // Faixas pequenas de propósito (como no invariante 3 de budget-avaliacao):
        // ritmo baixo com alvo grande faria o loop de mesProvavel rodar de mais.
        fc.integer({ min: 100_00, max: 500_000 }),
        fc.integer({ min: 0, max: 400_000 }),
        fc.integer({ min: 10_000, max: 500_000 }),
        fc.integer({ min: 1, max: 24 * 31 }),
        (alvoVal, reservadoVal, planejadoVal, diasAFrente) => {
          const alvo = cents(Math.max(alvoVal, reservadoVal + 1))
          const reservado = cents(reservadoVal)
          const dataAlvo = isoDate(dataAlvoDaquiA(diasAFrente))
          const planejado = cents(planejadoVal)

          const base = avaliarMeta({ alvo, reservado, dataAlvo, planejado, movimentos: [], hoje, diaInicio })
          fc.pre(base.situacao === 'fora_do_prazo')
          fc.pre(base.opcoes !== null)

          if (base.opcoes!.aumentarContribuicao !== null) {
            const r = avaliarMeta({
              alvo,
              reservado,
              dataAlvo,
              planejado: cents(base.opcoes!.aumentarContribuicao),
              movimentos: [],
              hoje,
              diaInicio,
            })
            expect(r.situacao).not.toBe('fora_do_prazo')
          }

          if (base.opcoes!.reduzirAlvo !== null && base.ritmo !== null) {
            const r = avaliarMeta({
              alvo: cents(base.opcoes!.reduzirAlvo),
              reservado,
              dataAlvo,
              planejado,
              movimentos: [],
              hoje,
              diaInicio,
            })
            expect(r.situacao).not.toBe('fora_do_prazo')
          }

          if (base.opcoes!.mudarData !== null) {
            const r = avaliarMeta({
              alvo,
              reservado,
              dataAlvo: base.opcoes!.mudarData,
              planejado,
              movimentos: [],
              hoje,
              diaInicio,
            })
            expect(r.situacao).not.toBe('fora_do_prazo')
          }
        },
      ),
    )
  })

  it('5. contraexemplo original: aumentarContribuicao e reduzirAlvo agora resolvem', () => {
    // Achado pelo fast-check antes do fix de 6.4 (seed shrunk para
    // [10001,0,10000,1]): com a comparação antiga (fim do mês provável > dia
    // exato da data-alvo), este caso ficava fora_do_prazo mesmo depois de
    // aumentar a contribuição para `necessaria` ou reduzir o alvo. Com a regra
    // por início de período (spec 3.4 vinculante), a própria base já nasce
    // no_prazo — por isso `opcoes` é nulo aqui — mas os valores que antes
    // alimentariam as opções (`necessaria` e `reservado + ritmo × mesesRestantes`)
    // continuam disponíveis para exibição e, aplicados, não reintroduzem
    // fora_do_prazo.
    const alvo = cents(10_001)
    const reservado = cents(0)
    const dataAlvo = isoDate('2026-11-15') // ~1 mês depois de hoje (2026-10-15)
    const planejado = cents(10_000)

    const base = avaliarMeta({ alvo, reservado, dataAlvo, planejado, movimentos: [], hoje, diaInicio })
    expect(base.situacao).toBe('no_prazo')
    expect(base.opcoes).toBeNull()
    expect(base.necessaria).toBe(5_001)

    const aumentarContribuicao = base.necessaria!
    const reduzirAlvo = reservado + base.ritmo!.valor * base.mesesRestantes!

    const comContribuicaoAumentada = avaliarMeta({
      alvo,
      reservado,
      dataAlvo,
      planejado: cents(aumentarContribuicao),
      movimentos: [],
      hoje,
      diaInicio,
    })
    expect(comContribuicaoAumentada.situacao).not.toBe('fora_do_prazo')

    const comAlvoReduzido = avaliarMeta({
      alvo: cents(reduzirAlvo),
      reservado,
      dataAlvo,
      planejado,
      movimentos: [],
      hoje,
      diaInicio,
    })
    expect(comAlvoReduzido.situacao).not.toBe('fora_do_prazo')
  })

  it('5. prazo vencido: só mudarData resolve; hoje permanece o mesmo', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100_00, max: 1_000_000_00 }),
        fc.integer({ min: 0, max: 999_999_00 }),
        fc.integer({ min: 10_000, max: 500_000 }),
        (alvoVal, reservadoVal, planejadoVal) => {
          const alvo = cents(Math.max(alvoVal, reservadoVal + 1))
          const reservado = cents(reservadoVal)
          const dataAlvo = isoDate('2020-01-01')
          const planejado = cents(planejadoVal)

          const base = avaliarMeta({ alvo, reservado, dataAlvo, planejado, movimentos: [], hoje, diaInicio })
          fc.pre(base.situacao === 'prazo_vencido')

          if (base.opcoes!.mudarData !== null) {
            const r = avaliarMeta({
              alvo,
              reservado,
              dataAlvo: base.opcoes!.mudarData,
              planejado,
              movimentos: [],
              hoje,
              diaInicio,
            })
            expect(r.situacao).not.toBe('prazo_vencido')
            expect(r.situacao).not.toBe('fora_do_prazo')
          }
        },
      ),
    )
  })
})
