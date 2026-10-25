import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { limparBanco, sqlAdmin } from './helpers'
import { criarUsuarioComSenha, verificarSenha } from '../../src/data/users'
import { abrirSessao, encerrarSessao, validarSessao } from '../../src/data/sessions'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

const conta = { email: 'pessoa@exemplo.com', senha: 'senha-longa-de-teste-123', nome: 'Pessoa' }

describe('usuários', () => {
  it('nunca guarda a senha em claro', async () => {
    const usuario = await criarUsuarioComSenha(conta)

    const [linha] = await sqlAdmin<{ password_hash: string }[]>`
      select password_hash from users where id = ${usuario.id}
    `
    expect(linha.password_hash).not.toContain(conta.senha)
    expect(linha.password_hash.startsWith('$argon2')).toBe(true)
  })

  it('semeia as catorze categorias na criação', async () => {
    const usuario = await criarUsuarioComSenha(conta)
    const [contagem] = await sqlAdmin<{ total: string }[]>`
      select count(*)::text as total from categories where user_id = ${usuario.id}
    `
    expect(Number(contagem.total)).toBe(14)
  })

  it('aceita a senha certa e recusa a errada', async () => {
    await criarUsuarioComSenha(conta)

    expect(await verificarSenha(conta.email, conta.senha)).not.toBeNull()
    expect(await verificarSenha(conta.email, 'errada')).toBeNull()
  })

  it('e-mail inexistente devolve nulo sem revelar isso no tempo', async () => {
    const inicio = Date.now()
    expect(await verificarSenha('ninguem@exemplo.com', 'qualquer')).toBeNull()
    // A verificação contra um hash falso impede distinguir "usuário não
    // existe" de "senha errada" pela duração da resposta.
    expect(Date.now() - inicio).toBeGreaterThan(5)
  })
})

describe('sessões', () => {
  it('o token em claro não é gravado', async () => {
    const usuario = await criarUsuarioComSenha(conta)
    const { token } = await abrirSessao(usuario.id, {})

    const [linha] = await sqlAdmin<{ token_hash: string }[]>`select token_hash from sessions`
    expect(linha.token_hash).not.toBe(token)
  })

  it('valida e devolve o usuário', async () => {
    const usuario = await criarUsuarioComSenha(conta)
    const { token } = await abrirSessao(usuario.id, {})

    expect(await validarSessao(token)).toMatchObject({ userId: usuario.id })
  })

  it('sessão encerrada não vale mais', async () => {
    const usuario = await criarUsuarioComSenha(conta)
    const { token } = await abrirSessao(usuario.id, {})

    await encerrarSessao(token)
    expect(await validarSessao(token)).toBeNull()
  })

  it('AMEAÇA T12: sessão ociosa demais é bloqueada', async () => {
    const usuario = await criarUsuarioComSenha(conta)
    const { token } = await abrirSessao(usuario.id, {})

    await sqlAdmin`update sessions set last_seen_at = now() - interval '16 minutes'`

    expect(await validarSessao(token)).toBeNull()
  })

  it('sessão expirada não vale mais', async () => {
    const usuario = await criarUsuarioComSenha(conta)
    const { token } = await abrirSessao(usuario.id, {})

    await sqlAdmin`update sessions set expires_at = now() - interval '1 second'`

    expect(await validarSessao(token)).toBeNull()
  })

  it('token inventado não vale', async () => {
    expect(await validarSessao('token-inventado')).toBeNull()
  })
})

describe('caminho anterior ao login', () => {
  it('AMEAÇA T3: sem identidade, o role da aplicação não lê users nem sessions', async () => {
    const usuario = await criarUsuarioComSenha(conta)
    await abrirSessao(usuario.id, {})

    const visto = await sqlAdmin.begin(async (tx) => {
      await tx`set local role money_tree_app`
      const users = await tx`select id from users`
      const sessions = await tx`select id from sessions`
      return { users: users.length, sessions: sessions.length }
    })
    expect(visto).toEqual({ users: 0, sessions: 0 })
  })

  it('as funções de login não são executáveis por qualquer role', async () => {
    const funcoes = await sqlAdmin<{ proname: string; publico: boolean; definer: boolean }[]>`
      select proname,
             has_function_privilege('public', oid, 'execute') as publico,
             prosecdef as definer
      from pg_proc
      where proname like 'auth\\_%'
      order by proname
    `
    expect(funcoes.map((f) => f.proname)).toEqual([
      'auth_buscar_credencial',
      'auth_encerrar_sessao',
      'auth_validar_sessao',
    ])
    for (const funcao of funcoes) {
      expect(funcao.definer).toBe(true)
      expect(funcao.publico).toBe(false)
    }
  })

  it('e-mail é encontrado ignorando maiúsculas', async () => {
    await criarUsuarioComSenha(conta)
    expect(await verificarSenha('PESSOA@exemplo.com', conta.senha)).not.toBeNull()
  })
})
