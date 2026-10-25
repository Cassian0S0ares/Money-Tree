import { describe, expect, it } from 'vitest'
import { cents } from '../../src/domain/money'
import { conciliar } from '../../src/domain/reconciliation'

describe('conciliar', () => {
  it('sem diferença, confere e só resta confirmar', () => {
    const resultado = conciliar(cents(150_00), cents(150_00))
    expect(resultado.differenceCents).toBe(0)
    expect(resultado.confere).toBe(true)
    expect(resultado.decisoesPossiveis).toEqual([])
  })

  it('extrato maior que o razão: falta lançamento de entrada', () => {
    const resultado = conciliar(cents(200_00), cents(150_00))
    expect(resultado.differenceCents).toBe(50_00)
    expect(resultado.confere).toBe(false)
  })

  it('extrato menor que o razão: sobra lançamento no sistema', () => {
    const resultado = conciliar(cents(100_00), cents(150_00))
    expect(resultado.differenceCents).toBe(-50_00)
    expect(resultado.confere).toBe(false)
  })

  it('havendo diferença, oferece as quatro decisões do §5.3.1', () => {
    expect(conciliar(cents(100_00), cents(150_00)).decisoesPossiveis).toEqual([
      'lancamento_localizado',
      'duplicidade_removida',
      'ajuste_criado',
      'adiado',
    ])
  })

  it('a ordem das decisões não é cosmética', () => {
    // Procurar o lançamento que falta vem antes de criar ajuste. Ajuste é a
    // saída quando a investigação não resolve, não o primeiro impulso.
    const [primeira] = conciliar(cents(100_00), cents(150_00)).decisoesPossiveis
    expect(primeira).toBe('lancamento_localizado')
  })
})
