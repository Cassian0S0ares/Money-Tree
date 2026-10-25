import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// O jar de cookies do Next é simulado: o que importa aqui são as opções com
// que o cookie de sessão é gravado, não o mecanismo do framework.
const gravados: { nome: string; valor: string; opcoes: Record<string, unknown> }[] = []

vi.mock('next/headers', () => ({
  cookies: async () => ({
    set: (nome: string, valor: string, opcoes: Record<string, unknown>) =>
      gravados.push({ nome, valor, opcoes }),
    get: () => undefined,
    delete: () => {},
  }),
}))
vi.mock('next/navigation', () => ({ redirect: () => {} }))
vi.mock('../../src/data/sessions', () => ({ validarSessao: async () => null }))
vi.mock('../../src/data/users', () => ({ buscarUsuario: async () => null }))

beforeEach(() => {
  gravados.length = 0
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('AMEAÇA T1: cookie de sessão', () => {
  it('é HttpOnly, SameSite=Lax, vale para o site todo e expira junto com a sessão', async () => {
    const { definirCookieSessao } = await import('../../src/lib/session')
    const expiraEm = new Date('2026-12-01T00:00:00Z')

    await definirCookieSessao('token-de-teste', expiraEm)

    expect(gravados).toHaveLength(1)
    // Sem HttpOnly, um XSS leria o token; sem SameSite, outro site
    // dispararia requisições autenticadas.
    expect(gravados[0].opcoes).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      expires: expiraEm,
    })
  })

  it('é Secure em produção', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.resetModules()
    const { definirCookieSessao } = await import('../../src/lib/session')

    await definirCookieSessao('token-de-teste', new Date())

    expect(gravados[0].opcoes.secure).toBe(true)
  })
})
