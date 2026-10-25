import { hash, verify } from '@node-rs/argon2'
import { randomUUID } from 'node:crypto'
import { comoUsuario, semUsuario } from './with-user'
import { semearCategoriasPadrao } from './categories'

export interface Usuario {
  id: string
  email: string
  displayName: string
  locale: string
  timezone: string
  monthStartDay: number
}

/**
 * Hash de referência para comparar quando o e-mail não existe. Sem ele, a
 * resposta volta na hora e um atacante descobre quais e-mails estão
 * cadastrados só pelo tempo. Calculado na primeira chamada e guardado, para
 * não depender de `await` no topo do módulo durante o build.
 */
let hashFalso: Promise<string> | undefined
function obterHashFalso(): Promise<string> {
  hashFalso ??= hash('senha-inexistente-para-tempo-constante')
  return hashFalso
}

function paraUsuario(linha: Record<string, unknown>): Usuario {
  return {
    id: linha.id as string,
    email: linha.email as string,
    displayName: linha.display_name as string,
    locale: linha.locale as string,
    timezone: linha.timezone as string,
    monthStartDay: linha.month_start_day as number,
  }
}

export async function criarUsuarioComSenha(dados: {
  email: string
  senha: string
  nome: string
}): Promise<Usuario> {
  const passwordHash = await hash(dados.senha)

  // O id nasce aqui, e não no banco, para que o insert já rode com a
  // identidade do novo usuário: a policy de users exige id = app.user_id.
  const id = randomUUID()

  const usuario = await comoUsuario(id, async (sql) => {
    const [linha] = await sql`
      insert into users (id, email, password_hash, display_name)
      values (${id}, ${dados.email}, ${passwordHash}, ${dados.nome})
      returning *
    `
    return paraUsuario(linha)
  })

  await semearCategoriasPadrao(usuario.id)
  return usuario
}

export async function buscarUsuario(id: string): Promise<Usuario | null> {
  return comoUsuario(id, async (sql) => {
    const [linha] = await sql`select * from users where id = ${id}`
    return linha ? paraUsuario(linha) : null
  })
}

/** Devolve o usuário quando a senha confere, nulo quando não. */
export async function verificarSenha(email: string, senha: string): Promise<Usuario | null> {
  const credencial = await semUsuario(async (sql) => {
    const [encontrada] = await sql<{ id: string; password_hash: string }[]>`
      select id, password_hash from auth_buscar_credencial(${email})
    `
    return encontrada ?? null
  })

  // Verifica sempre, mesmo sem usuário: o custo do argon2 é o que iguala os
  // tempos de resposta e impede enumerar e-mails cadastrados.
  const hashParaTestar = credencial?.password_hash ?? (await obterHashFalso())
  const confere = await verify(hashParaTestar, senha).catch(() => false)

  return credencial && confere ? buscarUsuario(credencial.id) : null
}

export async function atualizarPreferencias(
  userId: string,
  dados: { displayName?: string; timezone?: string; monthStartDay?: number },
): Promise<Usuario> {
  const colunas: Record<string, unknown> = { updated_at: new Date() }
  if (dados.displayName !== undefined) colunas.display_name = dados.displayName
  if (dados.timezone !== undefined) colunas.timezone = dados.timezone
  if (dados.monthStartDay !== undefined) colunas.month_start_day = dados.monthStartDay

  return comoUsuario(userId, async (sql) => {
    const [linha] = await sql`update users set ${sql(colunas)} where id = ${userId} returning *`
    return paraUsuario(linha)
  })
}
