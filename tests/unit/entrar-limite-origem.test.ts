import { beforeEach, describe, expect, it, vi } from 'vitest'

let senhaConfere = false

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }),
  cookies: async () => ({ set: () => {}, get: () => undefined, delete: () => {} }),
}))
vi.mock('next/navigation', () => ({
  redirect: () => {
    throw new Error('REDIRECT')
  },
}))
vi.mock('../../src/data/users', () => ({
  verificarSenha: async () => (senhaConfere ? { id: 'usuario-1' } : null),
  buscarUsuario: async () => null,
}))
vi.mock('../../src/data/sessions', () => ({
  abrirSessao: async () => ({ token: 't', expiraEm: new Date() }),
  encerrarSessao: async () => {},
  validarSessao: async () => null,
}))
vi.mock('../../src/data/audit', () => ({ registrarEvento: async () => {} }))

const { entrar } = await import('../../src/app/entrar/acoes')
const { limparLimites } = await import('../../src/lib/rate-limit')

beforeEach(() => {
  limparLimites()
  senhaConfere = false
})

function tentativa(email: string) {
  const dados = new FormData()
  dados.set('email', email)
  dados.set('senha', 'Senha123')
  return entrar({}, dados)
}

describe('AMEAÇA T2: força bruta espalhada por muitas contas', () => {
  it('a mesma origem é barrada depois de 20 falhas, mesmo trocando de e-mail a cada vez', async () => {
    for (let i = 0; i < 20; i++) {
      expect((await tentativa(`vitima${i}@exemplo.com`)).erro).toBe('E-mail ou senha incorretos.')
    }

    const bloqueada = await tentativa('outra-vitima@exemplo.com')
    expect(bloqueada.erro).toMatch(/Muitas tentativas/)
  })

  it('acertar a senha de uma conta não zera o contador da origem', async () => {
    for (let i = 0; i < 19; i++) await tentativa(`vitima${i}@exemplo.com`)

    senhaConfere = true
    await expect(tentativa('minha-conta@exemplo.com')).rejects.toThrow('REDIRECT')
    senhaConfere = false

    await tentativa('vitima-19@exemplo.com')
    expect((await tentativa('vitima-20@exemplo.com')).erro).toMatch(/Muitas tentativas/)
  })
})
