import { beforeEach, describe, expect, it, vi } from 'vitest'
import { limparLimites, registrarTentativa, verificarLimite } from '../../src/lib/rate-limit'

beforeEach(() => {
  limparLimites()
  vi.useRealTimers()
})

describe('limite de tentativas', () => {
  it('permite as primeiras tentativas', () => {
    for (let i = 0; i < 5; i++) {
      expect(verificarLimite('pessoa@exemplo.com').permitido).toBe(true)
      registrarTentativa('pessoa@exemplo.com', false)
    }
  })

  it('AMEAÇA T2: bloqueia após cinco falhas', () => {
    for (let i = 0; i < 5; i++) registrarTentativa('pessoa@exemplo.com', false)

    const resultado = verificarLimite('pessoa@exemplo.com')
    expect(resultado.permitido).toBe(false)
    expect(resultado.esperarSegundos).toBeGreaterThan(0)
  })

  it('sucesso zera a contagem', () => {
    for (let i = 0; i < 4; i++) registrarTentativa('pessoa@exemplo.com', false)
    registrarTentativa('pessoa@exemplo.com', true)

    expect(verificarLimite('pessoa@exemplo.com').permitido).toBe(true)
  })

  it('chaves diferentes não interferem', () => {
    for (let i = 0; i < 5; i++) registrarTentativa('a@exemplo.com', false)

    expect(verificarLimite('a@exemplo.com').permitido).toBe(false)
    expect(verificarLimite('b@exemplo.com').permitido).toBe(true)
  })

  it('o bloqueio expira', () => {
    vi.useFakeTimers()
    for (let i = 0; i < 5; i++) registrarTentativa('pessoa@exemplo.com', false)
    expect(verificarLimite('pessoa@exemplo.com').permitido).toBe(false)

    vi.advanceTimersByTime(16 * 60 * 1000)
    expect(verificarLimite('pessoa@exemplo.com').permitido).toBe(true)
  })
})
