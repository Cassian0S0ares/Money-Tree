import { comoUsuario } from './with-user'
import type { CategoryKind } from '../domain/types'

export interface Categoria {
  id: string
  parentId: string | null
  name: string
  kind: CategoryKind
  isArchived: boolean
  isSystem: boolean
  sortOrder: number
}

export interface NovaCategoria {
  name: string
  kind: CategoryKind
  parentId?: string | null
  sortOrder?: number
}

function paraCategoria(linha: Record<string, unknown>): Categoria {
  return {
    id: linha.id as string,
    parentId: (linha.parent_id as string | null) ?? null,
    name: linha.name as string,
    kind: linha.kind as CategoryKind,
    isArchived: linha.is_archived as boolean,
    isSystem: linha.is_system as boolean,
    sortOrder: linha.sort_order as number,
  }
}

export async function listarCategorias(
  userId: string,
  opcoes: { kind?: CategoryKind; incluirArquivadas?: boolean } = {},
): Promise<Categoria[]> {
  const { kind, incluirArquivadas = false } = opcoes

  return comoUsuario(userId, async (sql) => {
    const linhas = await sql`
      select * from categories
      where ${incluirArquivadas ? sql`true` : sql`not is_archived`}
        and ${kind ? sql`kind = ${kind}` : sql`true`}
      order by sort_order, name
    `
    return linhas.map(paraCategoria)
  })
}

export async function criarCategoria(userId: string, dados: NovaCategoria): Promise<Categoria> {
  return comoUsuario(userId, async (sql) => {
    const [linha] = await sql`
      insert into categories (user_id, name, kind, parent_id, sort_order)
      values (${userId}, ${dados.name}, ${dados.kind}, ${dados.parentId ?? null}, ${dados.sortOrder ?? 999})
      returning *
    `
    return paraCategoria(linha)
  })
}

export async function atualizarCategoria(
  userId: string,
  id: string,
  dados: Partial<NovaCategoria>,
): Promise<Categoria> {
  const colunas: Record<string, unknown> = {}
  if (dados.name !== undefined) colunas.name = dados.name
  if (dados.kind !== undefined) colunas.kind = dados.kind
  if (dados.parentId !== undefined) colunas.parent_id = dados.parentId
  if (dados.sortOrder !== undefined) colunas.sort_order = dados.sortOrder
  colunas.updated_at = new Date()

  return comoUsuario(userId, async (sql) => {
    const [linha] = await sql`update categories set ${sql(colunas)} where id = ${id} returning *`
    if (!linha) throw new Error('Categoria não encontrada')
    return paraCategoria(linha)
  })
}

export async function arquivarCategoria(userId: string, id: string): Promise<void> {
  await comoUsuario(userId, (sql) => sql`
    update categories set is_archived = true, updated_at = now() where id = ${id}
  `)
}

/** As catorze do §5.5, chamadas na criação do usuário. */
export async function semearCategoriasPadrao(userId: string): Promise<void> {
  await comoUsuario(userId, (sql) => sql`select seed_categorias_padrao(${userId})`)
}
