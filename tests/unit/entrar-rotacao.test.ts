import { beforeEach, describe, expect, it, vi } from 'vitest'

const encerradas: string[] = []
let cookieAtual: string | undefined

vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    set: (_nome: string, valor: string) => {
      cookieAtual = valor
    },
    get: () => (cookieAtual ? { value: cookieAtual } : undefined),
    delete: () => {
      cookieAtual = undefined
    },
  }),
}))
vi.mock('next/navigation', () => ({
  redirect: () => {
    throw new Error('REDIRECT')
  },
}))
vi.mock('../../src/data/users', () => ({
  verificarSenha: async () => ({ id: 'usuario-1' }),
  buscarUsuario: async () => null,
}))
vi.mock('../../src/data/sessions', () => ({
  abrirSessao: async () => ({ token: 'token-novo', expiraEm: new Date() }),
  encerrarSessao: async (token: string) => {
    encerradas.push(token)
  },
  validarSessao: async () => null,
}))
vi.mock('../../src/data/audit', () => ({ registrarEvento: async () => {} }))

beforeEach(() => {
  encerradas.length = 0
  cookieAtual = undefined
})

function formulario() {
  const dados = new FormData()
  dados.set('email', 'pessoa@exemplo.com')
  dados.set('senha', 'senha-qualquer')
  return dados
}

describe('AMEAÇA T1: rotação da sessão ao entrar', () => {
  it('revoga o token que já estava no navegador e grava um novo', async () => {
    cookieAtual = 'token-antigo'
    const { entrar } = await import('../../src/app/entrar/acoes')

    await expect(entrar({}, formulario())).rejects.toThrow('REDIRECT')

    // Um token plantado antes do login (fixação de sessão) não pode
    // sobreviver a ele.
    expect(encerradas).toEqual(['token-antigo'])
    expect(cookieAtual).toBe('token-novo')
  })

  it('sem cookie anterior, só abre a sessão nova', async () => {
    const { entrar } = await import('../../src/app/entrar/acoes')

    await expect(entrar({}, formulario())).rejects.toThrow('REDIRECT')

    expect(encerradas).toEqual([])
    expect(cookieAtual).toBe('token-novo')
  })
})
