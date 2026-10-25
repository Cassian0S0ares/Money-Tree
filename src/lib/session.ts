import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { validarSessao } from '../data/sessions'
import { buscarUsuario, type Usuario } from '../data/users'

const NOME = process.env.SESSION_COOKIE_NAME ?? 'mt_session'

export async function definirCookieSessao(token: string, expiraEm: Date): Promise<void> {
  const jar = await cookies()
  jar.set(NOME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiraEm,
  })
}

export async function limparCookieSessao(): Promise<void> {
  const jar = await cookies()
  jar.delete(NOME)
}

export async function lerCookieSessao(): Promise<string | null> {
  const jar = await cookies()
  return jar.get(NOME)?.value ?? null
}

export async function usuarioAtual(): Promise<Usuario | null> {
  const token = await lerCookieSessao()
  if (!token) return null

  const sessao = await validarSessao(token)
  if (!sessao) return null

  return buscarUsuario(sessao.userId)
}

/** Para páginas e ações que exigem login. Redireciona quando não há sessão. */
export async function exigirUsuario(): Promise<Usuario> {
  const usuario = await usuarioAtual()
  if (!usuario) redirect('/entrar')
  return usuario
}
