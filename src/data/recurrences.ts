import type postgres from 'postgres'
import { comoUsuario } from './with-user'
import { dataOuNulo, paraLancamento, type Lancamento } from './transactions'
import { somarDias } from '../domain/dates'
import { cents } from '../domain/money'
import {
  RegraInvalidaError,
  ocorrencias,
  validarRegra,
  type PoliticaFimDeSemana,
  type RegraDatas,
  type UnidadeRecorrencia,
} from '../domain/recurrence'
import type { Cents, IsoDate, TransactionNature, TransactionStatus } from '../domain/types'

/**
 * Regras de recorrência e geração das ocorrências (spec da fatia 2).
 *
 * As ocorrências são lançamentos `previsto` comuns, gravados sob demanda:
 * `garantirOcorrencias` roda no caminho da requisição, é idempotente e
 * incremental. Não existe job; se a geração falha, a próxima requisição
 * gera o que faltou, e nada fica mentindo no meio-tempo.
 */

/** Até onde as ocorrências existem como linha (decisão 1 da spec). */
export const HORIZONTE_DIAS = 90
/** Primeira ocorrência no passado, no máximo (decisão 4). */
export const PASSADO_MAX_DIAS = 60
/** Proteções contra geração sem fim (ameaça T18). */
export const MAX_REGRAS_ATIVAS = 200
export const MAX_OCORRENCIAS_POR_CHAMADA = 1_000

export type TipoRecorrente = 'receita' | 'despesa' | 'transferencia'
export type EstadoRegra = 'ativa' | 'pausada' | 'encerrada'

export interface Regra extends RegraDatas {
  id: string
  seriesId: string
  kind: TipoRecorrente
  description: string
  accountId: string
  toAccountId: string | null
  categoryId: string | null
  nature: TransactionNature | null
  amountCents: Cents
  amountIsEstimate: boolean
  status: EstadoRegra
  pausedAt: IsoDate | null
  generatedUntil: IsoDate | null
}

export interface NovaRegra {
  kind: TipoRecorrente
  description: string
  accountId: string
  toAccountId?: string | null
  categoryId?: string | null
  nature?: TransactionNature | null
  amountCents: Cents
  amountIsEstimate?: boolean
  unit: UnidadeRecorrencia
  interval: number
  startDate: IsoDate
  dayOfMonth?: number | null
  endDate?: IsoDate | null
  maxOccurrences?: number | null
  weekendPolicy?: PoliticaFimDeSemana
}

export class LimiteRecorrenciaError extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'LimiteRecorrenciaError'
  }
}

export function paraRegra(linha: Record<string, unknown>): Regra {
  return {
    id: linha.id as string,
    seriesId: linha.series_id as string,
    kind: linha.kind as TipoRecorrente,
    description: linha.description as string,
    accountId: linha.account_id as string,
    toAccountId: (linha.to_account_id as string | null) ?? null,
    categoryId: (linha.category_id as string | null) ?? null,
    nature: (linha.nature as TransactionNature | null) ?? null,
    amountCents: cents(Number(linha.amount_cents)),
    amountIsEstimate: linha.amount_is_estimate as boolean,
    unit: linha.unit as UnidadeRecorrencia,
    interval: Number(linha.interval_count),
    startDate: dataOuNulo(linha.start_date)!,
    dayOfMonth: linha.day_of_month === null ? null : Number(linha.day_of_month),
    endDate: dataOuNulo(linha.end_date),
    maxOccurrences: linha.max_occurrences === null ? null : Number(linha.max_occurrences),
    weekendPolicy: linha.weekend_policy as PoliticaFimDeSemana,
    status: linha.status as EstadoRegra,
    pausedAt: dataOuNulo(linha.paused_at),
    generatedUntil: dataOuNulo(linha.generated_until),
  }
}

/**
 * Completa os padrões e valida. Dia do mês vem do início; fim de semana
 * passa para o próximo dia útil só em despesa (decisão 2): boleto de sábado
 * se paga na segunda, mas salário de sábado não se promete para segunda.
 */
export function normalizarRegra(dados: NovaRegra): RegraDatas & NovaRegra {
  const mensal = dados.unit === 'mes' || dados.unit === 'ano'
  const completa = {
    ...dados,
    dayOfMonth: mensal ? (dados.dayOfMonth ?? Number(dados.startDate.slice(8, 10))) : null,
    endDate: dados.endDate ?? null,
    maxOccurrences: dados.maxOccurrences ?? null,
    weekendPolicy: dados.weekendPolicy ?? (dados.kind === 'despesa' ? 'proximo_dia_util' : 'manter'),
  }
  validarRegra(completa)
  return completa
}

interface Primeira {
  status: Extract<TransactionStatus, 'previsto' | 'pendente' | 'liquidado'>
  settledDate: IsoDate | null
}

/**
 * Cria a regra. Com `primeira`, o lançamento que a pessoa está registrando
 * vira a primeira ocorrência (já pago, se for o caso), na mesma transação;
 * a geração depois encontra a data ocupada e não a duplica.
 */
export async function criarRegra(
  userId: string,
  dados: NovaRegra,
  opcoes: { hoje: IsoDate; primeira?: Primeira },
): Promise<Regra> {
  const regra = normalizarRegra(dados)

  if (regra.startDate < somarDias(opcoes.hoje, -PASSADO_MAX_DIAS)) {
    throw new RegraInvalidaError(
      `A primeira ocorrência pode ser no máximo ${PASSADO_MAX_DIAS} dias atrás`,
    )
  }

  return comoUsuario(userId, async (sql) => {
    const [{ total }] = await sql<{ total: number }[]>`
      select count(*)::int as total from recurrence_rules where status = 'ativa'
    `
    if (total >= MAX_REGRAS_ATIVAS) {
      throw new LimiteRecorrenciaError(
        `Limite de ${MAX_REGRAS_ATIVAS} recorrências ativas atingido. Encerre alguma para criar outra.`,
      )
    }

    const [linha] = await sql`
      insert into recurrence_rules (
        user_id, kind, description, account_id, to_account_id, category_id, nature,
        amount_cents, amount_is_estimate, unit, interval_count, start_date, day_of_month,
        end_date, max_occurrences, weekend_policy
      ) values (
        ${userId}, ${regra.kind}, ${regra.description}, ${regra.accountId},
        ${regra.toAccountId ?? null}, ${regra.categoryId ?? null}, ${regra.nature ?? null},
        ${regra.amountCents}, ${regra.amountIsEstimate ?? false}, ${regra.unit}, ${regra.interval},
        ${regra.startDate}, ${regra.dayOfMonth}, ${regra.endDate}, ${regra.maxOccurrences},
        ${regra.weekendPolicy}
      )
      returning *
    `
    const criada = paraRegra(linha)

    if (opcoes.primeira) {
      const [primeira] = ocorrencias(criada, criada.startDate, criada.startDate)
      await gravarOcorrencia(sql, userId, criada, primeira.nominal, primeira.vencimento, opcoes.primeira)
    }

    return criada
  })
}

/**
 * Grava uma ocorrência. Se a data da série já está ocupada (outra requisição
 * gerou antes, ou a pessoa pulou essa data), não faz nada: é isso que torna
 * a geração idempotente (T17).
 */
async function gravarOcorrencia(
  sql: postgres.TransactionSql,
  userId: string,
  regra: Regra,
  nominal: IsoDate,
  vencimento: IsoDate,
  estado: Primeira = { status: 'previsto', settledDate: null },
): Promise<void> {
  if (regra.kind === 'transferencia') {
    const [ocupada] = await sql`
      select 1 from transactions
      where recurrence_series_id = ${regra.seriesId} and occurrence_date = ${nominal}
      limit 1
    `
    if (ocupada) return

    // Savepoint: se outra requisição gravar a mesma data entre a checagem e
    // o insert, a violação de chave única desfaz só esta ocorrência.
    try {
      await sql.savepoint((sp) => sp`
        select create_transfer(
          ${userId}, ${regra.accountId}, ${regra.toAccountId}, ${regra.amountCents},
          ${regra.description}, ${nominal}::date, ${estado.settledDate}::date,
          ${estado.status}::transaction_status, null,
          ${regra.id}::uuid, ${nominal}::date, ${vencimento}::date
        )
      `)
    } catch (erro) {
      if ((erro as { code?: string }).code !== '23505') throw erro
    }
    return
  }

  await sql`
    insert into transactions (
      user_id, account_id, category_id, kind, nature, description, amount_cents, direction,
      status, competence_date, settled_date, due_date,
      recurrence_rule_id, recurrence_series_id, occurrence_date
    ) values (
      ${userId}, ${regra.accountId}, ${regra.categoryId}, ${regra.kind}, ${regra.nature},
      ${regra.description}, ${regra.amountCents}, ${regra.kind === 'receita' ? 1 : -1},
      ${estado.status}, ${nominal}, ${estado.settledDate}, ${vencimento},
      ${regra.id}, ${regra.seriesId}, ${nominal}
    )
    on conflict (recurrence_series_id, occurrence_date, direction)
      where recurrence_series_id is not null
      do nothing
  `
}

/**
 * Gera o que falta até `hoje + 90` em cada regra ativa e devolve quantas
 * ocorrências processou. Regra em dia custa uma consulta vazia. Cada regra
 * vai na sua transação, com a linha da regra travada (`skip locked`: se
 * outra requisição já está gerando aquela regra, esta segue adiante).
 * Para em 1.000 ocorrências por chamada (T18); a próxima continua de onde
 * `generated_until` parou.
 */
export async function garantirOcorrencias(userId: string, hoje: IsoDate): Promise<number> {
  const horizonte = somarDias(hoje, HORIZONTE_DIAS)

  const pendentes = await comoUsuario(userId, (sql) => sql<{ id: string }[]>`
    select id from recurrence_rules
    where status = 'ativa' and (generated_until is null or generated_until < ${horizonte})
    order by created_at
  `)

  let geradas = 0

  for (const { id } of pendentes) {
    if (geradas >= MAX_OCORRENCIAS_POR_CHAMADA) break

    geradas += await comoUsuario(userId, async (sql) => {
      const [linha] = await sql`
        select * from recurrence_rules
        where id = ${id} and status = 'ativa'
        for update skip locked
      `
      if (!linha) return 0
      const regra = paraRegra(linha)
      if (regra.generatedUntil !== null && regra.generatedUntil >= horizonte) return 0

      const de = regra.generatedUntil ? somarDias(regra.generatedUntil, 1) : regra.startDate
      const todas = ocorrencias(regra, de, horizonte)
      const lote = todas.slice(0, MAX_OCORRENCIAS_POR_CHAMADA - geradas)

      for (const ocorrencia of lote) {
        await gravarOcorrencia(sql, userId, regra, ocorrencia.nominal, ocorrencia.vencimento)
      }

      // Lote cortado pelo limite: avança só até a última gravada.
      const ate = lote.length < todas.length ? lote.at(-1)!.nominal : horizonte
      await sql`
        update recurrence_rules set generated_until = ${ate}, updated_at = now() where id = ${id}
      `
      return lote.length
    })
  }

  return geradas
}

export interface RegraComProxima extends Regra {
  /** Vencimento da próxima ocorrência em aberto, atrasada ou não. */
  proximoVencimento: IsoDate | null
}

export async function listarRegras(userId: string): Promise<RegraComProxima[]> {
  return comoUsuario(userId, async (sql) => {
    const linhas = await sql`
      select r.*, (
        select min(coalesce(t.due_date, t.competence_date))
        from transactions t
        where t.recurrence_rule_id = r.id and t.status in ('previsto', 'pendente')
      ) as proximo_vencimento
      from recurrence_rules r
      order by r.status, lower(r.description)
    `
    return linhas.map((linha) => ({
      ...paraRegra(linha),
      proximoVencimento: dataOuNulo(linha.proximo_vencimento),
    }))
  })
}

export async function buscarRegra(userId: string, id: string): Promise<Regra | null> {
  return comoUsuario(userId, async (sql) => {
    const [linha] = await sql`select * from recurrence_rules where id = ${id}`
    return linha ? paraRegra(linha) : null
  })
}

/** Ocorrências da regra, em ordem de data; os dois lados, na transferência. */
export async function ocorrenciasDaRegra(userId: string, regraId: string): Promise<Lancamento[]> {
  return comoUsuario(userId, async (sql) => {
    const linhas = await sql`
      select * from transactions
      where recurrence_rule_id = ${regraId}
      order by occurrence_date, direction
    `
    return linhas.map(paraLancamento)
  })
}
