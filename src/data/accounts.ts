import type postgres from 'postgres'
import { comoUsuario } from './with-user'
import { cents } from '../domain/money'
import { isoDate } from '../domain/dates'
import type { AccountType, Cents, IsoDate } from '../domain/types'

export interface Conta {
  id: string
  name: string
  type: AccountType
  institution: string | null
  initialBalanceCents: Cents
  initialBalanceDate: IsoDate
  isLiquid: boolean
  includeInAvailable: boolean
  includeInNetWorth: boolean
  isArchived: boolean
  lastReconciledAt: Date | null
}

export interface ContaComSaldo extends Conta {
  balanceCents: Cents
  isEstimated: boolean
}

export interface NovaConta {
  name: string
  type: AccountType
  institution?: string | null
  initialBalanceCents: Cents
  initialBalanceDate: IsoDate
  isLiquid?: boolean
  includeInAvailable?: boolean
  includeInNetWorth?: boolean
}

/**
 * O driver devolve `bigint` como string para não perder precisão. Converter
 * aqui, num único lugar, evita que um `Number` apareça por acidente lá na
 * frente — ou pior, uma concatenação de strings somando saldos.
 */
function paraConta(linha: Record<string, unknown>): Conta {
  return {
    id: linha.id as string,
    name: linha.name as string,
    type: linha.type as AccountType,
    institution: (linha.institution as string | null) ?? null,
    initialBalanceCents: cents(Number(linha.initial_balance_cents)),
    initialBalanceDate: isoDate(
      linha.initial_balance_date instanceof Date
        ? linha.initial_balance_date.toISOString().slice(0, 10)
        : String(linha.initial_balance_date),
    ),
    isLiquid: linha.is_liquid as boolean,
    includeInAvailable: linha.include_in_available as boolean,
    includeInNetWorth: linha.include_in_net_worth as boolean,
    isArchived: linha.is_archived as boolean,
    lastReconciledAt: (linha.last_reconciled_at as Date | null) ?? null,
  }
}

export async function listarContas(
  userId: string,
  opcoes: { incluirArquivadas?: boolean } = {},
): Promise<Conta[]> {
  const incluirArquivadas = opcoes.incluirArquivadas ?? false

  return comoUsuario(userId, async (sql) => {
    const linhas = await sql`
      select * from accounts
      where ${incluirArquivadas ? sql`true` : sql`not is_archived`}
      order by is_archived, name
    `
    return linhas.map(paraConta)
  })
}

export async function listarContasComSaldo(userId: string): Promise<ContaComSaldo[]> {
  return comoUsuario(userId, async (sql) => {
    const linhas = await sql`
      select a.*, b.balance_cents, b.is_estimated
      from accounts a
      join account_balances b on b.account_id = a.id
      where not a.is_archived
      order by a.name
    `
    return linhas.map((linha) => ({
      ...paraConta(linha),
      balanceCents: cents(Number(linha.balance_cents)),
      isEstimated: linha.is_estimated as boolean,
    }))
  })
}

export async function buscarConta(userId: string, id: string): Promise<Conta | null> {
  return comoUsuario(userId, async (sql) => {
    const [linha] = await sql`select * from accounts where id = ${id}`
    return linha ? paraConta(linha) : null
  })
}

export async function criarConta(userId: string, dados: NovaConta): Promise<Conta> {
  return comoUsuario(userId, async (sql) => {
    const [linha] = await sql`
      insert into accounts (
        user_id, name, type, institution,
        initial_balance_cents, initial_balance_date,
        is_liquid, include_in_available, include_in_net_worth
      ) values (
        ${userId}, ${dados.name}, ${dados.type}, ${dados.institution ?? null},
        ${dados.initialBalanceCents}, ${dados.initialBalanceDate},
        ${dados.isLiquid ?? null}, ${dados.includeInAvailable ?? null},
        ${dados.includeInNetWorth ?? true}
      )
      returning *
    `
    return paraConta(linha)
  })
}

/** Atualização parcial: campo ausente fica como está, não vira nulo. */
export async function atualizarConta(
  userId: string,
  id: string,
  dados: Partial<NovaConta>,
): Promise<Conta> {
  const colunas: Record<string, unknown> = {}
  if (dados.name !== undefined) colunas.name = dados.name
  if (dados.type !== undefined) colunas.type = dados.type
  if (dados.institution !== undefined) colunas.institution = dados.institution
  if (dados.initialBalanceCents !== undefined)
    colunas.initial_balance_cents = dados.initialBalanceCents
  if (dados.initialBalanceDate !== undefined)
    colunas.initial_balance_date = dados.initialBalanceDate
  if (dados.isLiquid !== undefined) colunas.is_liquid = dados.isLiquid
  if (dados.includeInAvailable !== undefined)
    colunas.include_in_available = dados.includeInAvailable
  if (dados.includeInNetWorth !== undefined)
    colunas.include_in_net_worth = dados.includeInNetWorth

  if (Object.keys(colunas).length === 0) {
    const atual = await buscarConta(userId, id)
    if (!atual) throw new Error('Conta não encontrada')
    return atual
  }

  colunas.updated_at = new Date()

  return comoUsuario(userId, async (sql) => {
    const [linha] = await sql`
      update accounts set ${sql(colunas)} where id = ${id} returning *
    `
    if (!linha) throw new Error('Conta não encontrada')
    return paraConta(linha)
  })
}

/** Arquivar nunca apaga histórico (§5.2). */
export async function arquivarConta(userId: string, id: string): Promise<void> {
  await comoUsuario(userId, (sql) => sql`
    update accounts set is_archived = true, updated_at = now() where id = ${id}
  `)
}

export async function marcarConciliada(
  userId: string,
  id: string,
  quando: Date,
  tx?: postgres.TransactionSql,
): Promise<void> {
  const executar = (sql: postgres.TransactionSql) => sql`
    update accounts set last_reconciled_at = ${quando}, updated_at = now() where id = ${id}
  `
  if (tx) {
    await executar(tx)
    return
  }
  await comoUsuario(userId, executar)
}
