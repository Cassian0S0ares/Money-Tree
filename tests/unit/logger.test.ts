import { describe, expect, it } from 'vitest'
import { redigir } from '../../src/lib/logger'

describe('redigir', () => {
  it('apaga chaves sensíveis em qualquer profundidade', () => {
    const entrada = {
      userId: 'abc',
      password: 'segredo',
      token: 'xyz',
      amountCents: 12345,
      description: 'Farmácia da esquina',
      nested: { password_hash: 'h', counterparty: 'Padaria', notes: 'anotação' },
    }

    expect(redigir(entrada)).toEqual({
      userId: 'abc',
      password: '[redigido]',
      token: '[redigido]',
      amountCents: '[redigido]',
      description: '[redigido]',
      nested: {
        password_hash: '[redigido]',
        counterparty: '[redigido]',
        notes: '[redigido]',
      },
    })
  })

  it('atravessa listas', () => {
    expect(redigir([{ amountCents: 1 }, { ok: 2 }])).toEqual([
      { amountCents: '[redigido]' },
      { ok: 2 },
    ])
  })

  it('não quebra com valor primitivo nem nulo', () => {
    expect(redigir('texto')).toBe('texto')
    expect(redigir(null)).toBe(null)
    expect(redigir(42)).toBe(42)
  })

  it('não entra em laço infinito com referência circular', () => {
    const circular: Record<string, unknown> = { ok: 1 }
    circular.self = circular
    expect(() => redigir(circular)).not.toThrow()
  })
})
