import { describe, expect, it } from 'vitest'
import { isoDate } from '../../src/domain/dates'
import { cents } from '../../src/domain/money'
import {
  LancamentoInvalidoError,
  MOVEM_SALDO,
  STATUS_INICIAIS,
  assertTransicao,
  direcaoPara,
  estaAtrasado,
  podeTransicionar,
  validarLancamento,
} from '../../src/domain/transaction'

describe('estados iniciais', () => {
  it('lançamento pode nascer liquidado', () => {
    expect(STATUS_INICIAIS).toEqual(['previsto', 'pendente', 'liquidado'])
  })
})

describe('transições', () => {
  it.each([
    ['previsto', 'pendente'],
    ['previsto', 'liquidado'],
    ['previsto', 'cancelado'],
    ['pendente', 'liquidado'],
    ['pendente', 'cancelado'],
    ['liquidado', 'conciliado'],
    ['liquidado', 'estornado'],
    ['conciliado', 'estornado'],
  ] as const)('permite %s -> %s', (de, para) => {
    expect(podeTransicionar(de, para)).toBe(true)
  })

  it.each([
    ['liquidado', 'previsto'],
    ['liquidado', 'cancelado'],
    ['conciliado', 'liquidado'],
    ['cancelado', 'previsto'],
    ['estornado', 'liquidado'],
  ] as const)('proíbe %s -> %s', (de, para) => {
    expect(podeTransicionar(de, para)).toBe(false)
  })

  it('liquidado não pode ser cancelado, só estornado', () => {
    expect(() => assertTransicao('liquidado', 'cancelado')).toThrow(LancamentoInvalidoError)
  })

  it('cancelado e estornado são terminais', () => {
    const todos = [
      'previsto',
      'pendente',
      'liquidado',
      'conciliado',
      'cancelado',
      'estornado',
    ] as const
    for (const destino of todos) {
      expect(podeTransicionar('cancelado', destino)).toBe(false)
      expect(podeTransicionar('estornado', destino)).toBe(false)
    }
  })
})

describe('direção', () => {
  it('receita entra, despesa sai', () => {
    expect(direcaoPara('receita')).toBe(1)
    expect(direcaoPara('despesa')).toBe(-1)
  })

  it('transferência e ajuste exigem direção explícita', () => {
    expect(direcaoPara('transferencia', -1)).toBe(-1)
    expect(direcaoPara('ajuste', 1)).toBe(1)
    expect(() => direcaoPara('transferencia')).toThrow(LancamentoInvalidoError)
  })

  it('rejeita direção que contraria o tipo', () => {
    expect(() => direcaoPara('receita', -1)).toThrow(LancamentoInvalidoError)
  })
})

describe('validarLancamento', () => {
  const base = {
    kind: 'despesa' as const,
    amountCents: cents(1000),
    direction: -1 as const,
    status: 'liquidado' as const,
    competenceDate: isoDate('2026-09-18'),
    settledDate: isoDate('2026-09-18'),
    nature: 'variavel' as const,
    categoryId: 'cat-1',
    transferGroupId: null,
    adjustmentReason: null,
  }

  it('aceita uma despesa bem formada', () => {
    expect(() => validarLancamento(base)).not.toThrow()
  })

  it('rejeita valor zero ou negativo: o sinal vem da direção', () => {
    expect(() => validarLancamento({ ...base, amountCents: cents(0) })).toThrow(
      LancamentoInvalidoError,
    )
    expect(() => validarLancamento({ ...base, amountCents: cents(-1) })).toThrow(
      LancamentoInvalidoError,
    )
  })

  it('exige data de liquidação quando liquidado', () => {
    expect(() => validarLancamento({ ...base, settledDate: null })).toThrow(
      LancamentoInvalidoError,
    )
  })

  it('proíbe data de liquidação quando ainda previsto', () => {
    expect(() => validarLancamento({ ...base, status: 'previsto' })).toThrow(
      LancamentoInvalidoError,
    )
  })

  it('transferência exige grupo e proíbe categoria', () => {
    const transferencia = {
      ...base,
      kind: 'transferencia' as const,
      nature: null,
      categoryId: null,
      transferGroupId: 'grupo-1',
    }
    expect(() => validarLancamento(transferencia)).not.toThrow()
    expect(() => validarLancamento({ ...transferencia, transferGroupId: null })).toThrow(
      LancamentoInvalidoError,
    )
    expect(() => validarLancamento({ ...transferencia, categoryId: 'cat-1' })).toThrow(
      LancamentoInvalidoError,
    )
  })

  it('ajuste exige motivo', () => {
    const ajuste = {
      ...base,
      kind: 'ajuste' as const,
      nature: null,
      categoryId: null,
      adjustmentReason: null,
    }
    expect(() => validarLancamento(ajuste)).toThrow(LancamentoInvalidoError)
    expect(() =>
      validarLancamento({ ...ajuste, adjustmentReason: 'divergência de extrato' }),
    ).not.toThrow()
  })

  it('natureza só existe em receita e despesa', () => {
    const ajusteComNatureza = {
      ...base,
      kind: 'ajuste' as const,
      categoryId: null,
      adjustmentReason: 'motivo',
      nature: 'fixa' as const,
    }
    expect(() => validarLancamento(ajusteComNatureza)).toThrow(LancamentoInvalidoError)
  })
})

describe('estaAtrasado', () => {
  const hoje = isoDate('2026-09-18')

  it('vencido e não liquidado está atrasado', () => {
    expect(estaAtrasado({ competenceDate: isoDate('2026-09-10'), status: 'previsto' }, hoje)).toBe(
      true,
    )
    expect(estaAtrasado({ competenceDate: isoDate('2026-09-10'), status: 'pendente' }, hoje)).toBe(
      true,
    )
  })

  it('vencido mas liquidado não está atrasado', () => {
    expect(estaAtrasado({ competenceDate: isoDate('2026-09-10'), status: 'liquidado' }, hoje)).toBe(
      false,
    )
  })

  it('cancelado nunca está atrasado', () => {
    expect(estaAtrasado({ competenceDate: isoDate('2026-01-01'), status: 'cancelado' }, hoje)).toBe(
      false,
    )
  })

  it('vence hoje ainda não está atrasado', () => {
    expect(estaAtrasado({ competenceDate: hoje, status: 'previsto' }, hoje)).toBe(false)
  })
})

describe('MOVEM_SALDO', () => {
  it('só liquidado e conciliado movem saldo', () => {
    expect(MOVEM_SALDO).toEqual(['liquidado', 'conciliado'])
  })
})
