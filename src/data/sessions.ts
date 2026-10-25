import { createHash, randomBytes } from 'node:crypto'
import { comoUsuario, semUsuario } from './with-user'

const TTL_MINUTOS = Number(process.env.SESSION_TTL_MINUTES ?? 43_200)
const OCIOSIDADE_MINUTOS = Number(process.env.SESSION_IDLE_LOCK_MINUTES ?? 15)

/** SHA-256 basta: o token tem 256 bits de aleatoriedade, não é senha humana. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function hashOpcional(valor: string | undefined): string | null {
  return valor ? createHash('sha256').update(valor).digest('hex') : null
}

export async function abrirSessao(
  userId: string,
  contexto: { userAgent?: string; ip?: string },
): Promise<{ token: string; expiraEm: Date }> {
  const token = randomBytes(32).toString('base64url')
  const expiraEm = new Date(Date.now() + TTL_MINUTOS * 60_000)

  await comoUsuario(userId, (sql) => sql`
    insert into sessions (user_id, token_hash, expires_at, user_agent_hash, ip_hash)
    values (
      ${userId}, ${hashToken(token)}, ${expiraEm},
      ${hashOpcional(contexto.userAgent)}, ${hashOpcional(contexto.ip)}
    )
  `)

  return { token, expiraEm }
}

/**
 * Valida e renova o relógio de ociosidade. Três coisas invalidam: sessão
 * revogada, prazo total vencido, ou tempo demais sem uso — o bloqueio por
 * inatividade que o §11 exige. Ver `auth_validar_sessao` na migração 006.
 */
export async function validarSessao(token: string): Promise<{ userId: string } | null> {
  const userId = await semUsuario(async (sql) => {
    const [linha] = await sql<{ user_id: string | null }[]>`
      select auth_validar_sessao(${hashToken(token)}, ${OCIOSIDADE_MINUTOS}) as user_id
    `
    return linha?.user_id ?? null
  })

  return userId ? { userId } : null
}

export async function encerrarSessao(token: string): Promise<void> {
  await semUsuario((sql) => sql`select auth_encerrar_sessao(${hashToken(token)})`)
}

export async function encerrarTodasSessoes(userId: string): Promise<void> {
  await comoUsuario(userId, (sql) => sql`
    update sessions set revoked_at = now() where user_id = ${userId} and revoked_at is null
  `)
}
