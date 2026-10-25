import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { validarSessao } from '../data/sessions'
import { buscarUsuario, type Usuario } from '../data/users'
import { garantirOcorrencias } from '../data/recurrences'
import { hojeEm } from '../domain/dates'
import { log } from './logger'

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

/**
 * Layout e página pedem o usuário na mesma requisição; `cache` faz a sessão
 * ser validada uma vez só por renderização.
 */
export const usuarioAtual = cache(async (): Promise<Usuario | null> => {
  const token = await lerCookieSessao()
  if (!token) return null

  const sessao = await validarSessao(token)
  if (!sessao) return null

  return buscarUsuario(sessao.userId)
})

/**
 * Ocorrências recorrentes são geradas no caminho da requisição, não por um
 * job (spec da fatia 2, seção 4). Fica aqui, e não no layout, porque layout
 * e página renderizam em paralelo: a página leria as próximas contas antes
 * de a geração terminar. Toda página aguarda `exigirUsuario` antes de ler,
 * e `cache` faz a geração rodar uma vez por requisição. Se falhar, a página
 * abre mesmo assim e a próxima requisição gera o que faltou.
 */
const prepararOcorrencias = cache(async (userId: string, timezone: string) => {
  try {
    await garantirOcorrencias(userId, hojeEm(timezone))
  } catch (erro) {
    log.error('recorrencia.geracao_falhou', { codigo: (erro as { code?: string })?.code })
  }
})

/** Para páginas e ações que exigem login. Redireciona quando não há sessão. */
export async function exigirUsuario(): Promise<Usuario> {
  const usuario = await usuarioAtual()
  if (!usuario) redirect('/entrar')
  await prepararOcorrencias(usuario.id, usuario.timezone)
  return usuario
}
