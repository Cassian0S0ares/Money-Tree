import { comoUsuario } from './with-user'
import { isoDate } from '../domain/dates'
import { cents } from '../domain/money'
import { assertTransicao, direcaoPara, validarLancamento } from '../domain/transaction'
import type {
  Cents,
  IsoDate,
  TransactionKind,
  TransactionNature,
  TransactionSource,
  TransactionStatus,
} from '../domain/types'

export interface Lancamento {
  id: string
  accountId: string
  categoryId: string | null
  kind: TransactionKind
  nature: TransactionNature | null
  description: string
  counterparty: string | null
  notes: string | null
  amountCents: Cents
  direction: -1 | 1
  signedAmountCents: Cents
  status: TransactionStatus
  competenceDate: IsoDate
  settledDate: IsoDate | null
  transferGroupId: string | null
  adjustmentReason: string | null
  source: TransactionSource
  createdAt: Date
  /** Vencimento; nulo em lançamento avulso, que vence na competência. */
  dueDate: IsoDate | null
  recurrenceRuleId: string | null
  /** Data nominal da ocorrência na regra; nula fora de recorrência. */
  occurrenceDate: IsoDate | null
  isException: boolean
}

export interface NovoLancamento {
  accountId: string
  categoryId?: string | null
  kind: TransactionKind
  nature?: TransactionNature | null
  description: string
  counterparty?: string | null
  notes?: string | null
  amountCents: Cents
  direction?: -1 | 1
  status: TransactionStatus
  competenceDate: IsoDate
  settledDate?: IsoDate | null
  adjustmentReason?: string | null
  source?: TransactionSource
  externalId?: string | null
}

export interface FiltroLancamentos {
  accountId?: string
  categoryId?: string
  status?: TransactionStatus
  de?: IsoDate
  ate?: IsoDate
  limite?: number
  deslocamento?: number
}

export function dataOuNulo(valor: unknown): IsoDate | null {
  if (valor === null || valor === undefined) return null
  return isoDate(valor instanceof Date ? valor.toISOString().slice(0, 10) : String(valor))
}

export function paraLancamento(linha: Record<string, unknown>): Lancamento {
  return {
    id: linha.id as string,
    accountId: linha.account_id as string,
    categoryId: (linha.category_id as string | null) ?? null,
    kind: linha.kind as TransactionKind,
    nature: (linha.nature as TransactionNature | null) ?? null,
    description: linha.description as string,
    counterparty: (linha.counterparty as string | null) ?? null,
    notes: (linha.notes as string | null) ?? null,
    amountCents: cents(Number(linha.amount_cents)),
    direction: Number(linha.direction) as -1 | 1,
    signedAmountCents: cents(Number(linha.signed_amount_cents)),
    status: linha.status as TransactionStatus,
    competenceDate: dataOuNulo(linha.competence_date)!,
    settledDate: dataOuNulo(linha.settled_date),
    transferGroupId: (linha.transfer_group_id as string | null) ?? null,
    adjustmentReason: (linha.adjustment_reason as string | null) ?? null,
    source: linha.source as TransactionSource,
    createdAt: linha.created_at as Date,
    dueDate: dataOuNulo(linha.due_date),
    recurrenceRuleId: (linha.recurrence_rule_id as string | null) ?? null,
    occurrenceDate: dataOuNulo(linha.occurrence_date),
    isException: (linha.is_exception as boolean | undefined) ?? false,
  }
}

export async function criarLancamento(
  userId: string,
  dados: NovoLancamento,
): Promise<Lancamento> {
  const direction = direcaoPara(dados.kind, dados.direction)

  // Falha aqui é falha barata: mensagem legível, sem ida ao banco. As mesmas
  // regras existem como CHECK, que é o que garante a invariante de verdade.
  validarLancamento({
    kind: dados.kind,
    amountCents: dados.amountCents,
    direction,
    status: dados.status,
    competenceDate: dados.competenceDate,
    settledDate: dados.settledDate ?? null,
    nature: dados.nature ?? null,
    categoryId: dados.categoryId ?? null,
    transferGroupId: null,
    adjustmentReason: dados.adjustmentReason ?? null,
  })

  return comoUsuario(userId, async (sql) => {
    const [linha] = await sql`
      insert into transactions (
        user_id, account_id, category_id, kind, nature, description, counterparty, notes,
        amount_cents, direction, status, competence_date, settled_date,
        adjustment_reason, source, external_id
      ) values (
        ${userId}, ${dados.accountId}, ${dados.categoryId ?? null}, ${dados.kind},
        ${dados.nature ?? null}, ${dados.description}, ${dados.counterparty ?? null},
        ${dados.notes ?? null}, ${dados.amountCents}, ${direction}, ${dados.status},
        ${dados.competenceDate}, ${dados.settledDate ?? null},
        ${dados.adjustmentReason ?? null}, ${dados.source ?? 'manual'}, ${dados.externalId ?? null}
      )
      returning *
    `
    return paraLancamento(linha)
  })
}

export async function buscarLancamento(userId: string, id: string): Promise<Lancamento | null> {
  return comoUsuario(userId, async (sql) => {
    const [linha] = await sql`select * from transactions where id = ${id}`
    return linha ? paraLancamento(linha) : null
  })
}

export async function listarLancamentos(
  userId: string,
  filtro: FiltroLancamentos,
): Promise<{ itens: Lancamento[]; total: number }> {
  const limite = Math.min(filtro.limite ?? 50, 200)
  const deslocamento = filtro.deslocamento ?? 0

  return comoUsuario(userId, async (sql) => {
    const onde = sql`
      where ${filtro.accountId ? sql`account_id = ${filtro.accountId}` : sql`true`}
        and ${filtro.categoryId ? sql`category_id = ${filtro.categoryId}` : sql`true`}
        and ${filtro.status ? sql`status = ${filtro.status}` : sql`true`}
        and ${filtro.de ? sql`competence_date >= ${filtro.de}` : sql`true`}
        and ${filtro.ate ? sql`competence_date <= ${filtro.ate}` : sql`true`}
    `

    const linhas = await sql`
      select * from transactions ${onde}
      order by competence_date desc, created_at desc
      limit ${limite} offset ${deslocamento}
    `
    const [contagem] = await sql<{ total: string }[]>`
      select count(*)::text as total from transactions ${onde}
    `

    return { itens: linhas.map(paraLancamento), total: Number(contagem.total) }
  })
}

/**
 * Mudança de estado. Num lado de transferência, vale para o grupo inteiro
 * (§5.3): liquidar só um lado tiraria o dinheiro da origem sem pô-lo no
 * destino. As linhas ficam travadas até o fim, como no estorno.
 */
export async function atualizarStatus(
  userId: string,
  id: string,
  novoStatus: TransactionStatus,
  settledDate: IsoDate | null,
): Promise<Lancamento> {
  return comoUsuario(userId, async (sql) => {
    const linhas = await sql`
      select * from transactions
      where id = ${id}
         or transfer_group_id = (select transfer_group_id from transactions where id = ${id})
      for update
    `
    const lados = linhas.map(paraLancamento)
    if (!lados.some((lado) => lado.id === id)) throw new Error('Lançamento não encontrado')

    for (const lado of lados) assertTransicao(lado.status, novoStatus)

    const atualizadas = await sql`
      update transactions
      set status = ${novoStatus}, settled_date = ${settledDate}, updated_at = now()
      where id in ${sql(lados.map((lado) => lado.id))}
      returning *
    `
    return paraLancamento(atualizadas.find((linha) => linha.id === id)!)
  })
}

/**
 * O "desfazer" do aviso de criação. O gatilho do banco recusa apagar
 * liquidado, conciliado ou estornado — ali a regra é definitiva.
 */
export async function apagarLancamentoPrevisto(userId: string, id: string): Promise<void> {
  await comoUsuario(userId, (sql) => sql`delete from transactions where id = ${id}`)
}

export interface NovaTransferencia {
  fromAccountId: string
  toAccountId: string
  amountCents: Cents
  description: string
  competenceDate: IsoDate
  settledDate: IsoDate | null
  status: TransactionStatus
  notes?: string | null
}

/** Os dois lados numa única instrução. Ver `create_transfer` na migração 004. */
export async function criarTransferencia(
  userId: string,
  dados: NovaTransferencia,
): Promise<string> {
  return comoUsuario(userId, async (sql) => {
    const [linha] = await sql<{ create_transfer: string }[]>`
      select create_transfer(
        ${userId}, ${dados.fromAccountId}, ${dados.toAccountId}, ${dados.amountCents},
        ${dados.description}, ${dados.competenceDate}::date, ${dados.settledDate},
        ${dados.status}::transaction_status, ${dados.notes ?? null}
      )
    `
    return linha.create_transfer
  })
}

/**
 * Estorno: o original passa a `estornado` e deixa de contar; uma linha nova,
 * de sinal oposto, entra liquidada; o vínculo entre as duas fica em
 * `ledger_reversals`, que é imutável. Tudo numa transação — meio estorno é
 * pior do que nenhum.
 */
export async function estornarLancamento(
  userId: string,
  id: string,
  motivo: string,
): Promise<Lancamento> {
  if (!motivo.trim()) {
    throw new Error('Estorno exige motivo')
  }

  return comoUsuario(userId, async (sql) => {
    // Transferência é estornada inteira (§5.3): estornar só um lado faria
    // o dinheiro sumir de uma conta sem voltar à outra. As linhas ficam
    // travadas até o fim, para dois estornos simultâneos não se cruzarem.
    const linhas = await sql`
      select * from transactions
      where id = ${id}
         or transfer_group_id = (select transfer_group_id from transactions where id = ${id})
      for update
    `
    const lados = linhas.map(paraLancamento)
    if (!lados.some((lado) => lado.id === id)) throw new Error('Lançamento não encontrado')

    for (const lado of lados) assertTransicao(lado.status, 'estornado')

    let estornoPedido: Lancamento | undefined

    for (const original of lados) {
      const [estorno] = await sql`
        insert into transactions (
          user_id, account_id, kind, description, amount_cents, direction,
          status, competence_date, settled_date, adjustment_reason, source
        ) values (
          ${userId}, ${original.accountId}, 'ajuste',
          ${`Estorno: ${original.description}`}, ${original.amountCents},
          ${original.direction * -1}, 'liquidado',
          ${original.competenceDate}, ${original.settledDate ?? original.competenceDate},
          ${motivo}, 'manual'
        )
        returning *
      `

      await sql`
        update transactions set status = 'estornado', updated_at = now()
        where id = ${original.id}
      `

      await sql`
        insert into ledger_reversals (user_id, original_transaction_id, reversal_transaction_id, reason)
        values (${userId}, ${original.id}, ${estorno.id}, ${motivo})
      `

      if (original.id === id) estornoPedido = paraLancamento(estorno)
    }

    return estornoPedido!
  })
}
