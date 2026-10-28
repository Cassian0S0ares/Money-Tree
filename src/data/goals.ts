import type postgres from 'postgres'
import { comoUsuario } from './with-user'
import { dataOuNulo } from './transactions'
import { cents, formatBRL } from '../domain/money'
import {
  avaliarMeta,
  type AllocationKind,
  type AvaliacaoMeta,
  type GoalKind,
  type GoalPriority,
  type Movimento,
} from '../domain/goal'
import type { Cents, IsoDate } from '../domain/types'

/**
 * Metas: dados e reservas (spec da fatia 4, seções 3 e 7). O cálculo é do
 * domínio (`avaliarMeta`); aqui só se lê e se grava. O reservado nunca é
 * campo editável: é a soma dos movimentos em `goal_allocations` (spec 3.2),
 * e os limites de saldo ficam no gatilho da migração 011.
 */

export interface DadosMeta {
  name: string
  kind: GoalKind
  targetCents: Cents
  targetDate: IsoDate | null
  priority: GoalPriority
  accountId: string | null
  monthlyContributionCents: Cents | null
}

export interface Meta extends DadosMeta {
  id: string
  completedAt: string | null
  archivedAt: string | null
}

export interface MetaAvaliada extends Meta {
  reservado: Cents
  reservasPorConta: {
    accountId: string
    accountName: string
    reservado: Cents
    acimaDoSaldo: Cents
  }[]
  avaliacao: AvaliacaoMeta
}

export interface MovimentoMeta extends Movimento {
  id: string
  accountName: string
}

/**
 * Erro do formulário quando o gatilho de `goal_allocations` recusa o
 * movimento (spec 4.2 e 7). `disponivel` é calculado depois da falha, numa
 * consulta à parte, porque a transação que tentou o movimento já desfez.
 */
export class ReservaRecusadaError extends Error {
  constructor(
    public motivo: 'saldo' | 'reserva' | 'encerrada',
    public disponivel: Cents | null,
  ) {
    super(ReservaRecusadaError.mensagem(motivo, disponivel))
    this.name = 'ReservaRecusadaError'
  }

  private static mensagem(motivo: 'saldo' | 'reserva' | 'encerrada', disponivel: Cents | null): string {
    if (motivo === 'saldo') return `Essa conta tem só ${formatBRL(disponivel ?? cents(0))} sem reserva`
    if (motivo === 'reserva') return `Essa meta tem só ${formatBRL(disponivel ?? cents(0))} reservado nesta conta`
    return 'Meta encerrada ou conta arquivada não recebe aporte'
  }
}

const ORDEM_PRIORIDADE: Record<GoalPriority, number> = { alta: 0, media: 1, baixa: 2 }

/** Prioridade, depois data-alvo; nulas por último (spec 7). */
function compararMetas(a: Meta, b: Meta): number {
  const prioridade = ORDEM_PRIORIDADE[a.priority] - ORDEM_PRIORIDADE[b.priority]
  if (prioridade !== 0) return prioridade

  if (a.targetDate === null && b.targetDate === null) return 0
  if (a.targetDate === null) return 1
  if (b.targetDate === null) return -1
  return a.targetDate < b.targetDate ? -1 : a.targetDate > b.targetDate ? 1 : 0
}

/** Mais recente primeiro: concluída ou arquivada, o que valer. */
function compararEncerradas(a: Meta, b: Meta): number {
  const dataA = a.completedAt ?? a.archivedAt ?? ''
  const dataB = b.completedAt ?? b.archivedAt ?? ''
  return dataB < dataA ? -1 : dataB > dataA ? 1 : 0
}

function paraMeta(linha: Record<string, unknown>): Meta {
  return {
    id: linha.id as string,
    name: linha.name as string,
    kind: linha.kind as GoalKind,
    targetCents: cents(Number(linha.target_cents)),
    targetDate: dataOuNulo(linha.target_date),
    priority: linha.priority as GoalPriority,
    accountId: (linha.account_id as string | null) ?? null,
    monthlyContributionCents:
      linha.monthly_contribution_cents === null ? null : cents(Number(linha.monthly_contribution_cents)),
    completedAt: linha.completed_at ? (linha.completed_at as Date).toISOString() : null,
    archivedAt: linha.archived_at ? (linha.archived_at as Date).toISOString() : null,
  }
}

export async function criarMeta(userId: string, dados: DadosMeta): Promise<Meta> {
  return comoUsuario(userId, async (sql) => {
    const [linha] = await sql`
      insert into goals (
        user_id, name, kind, target_cents, target_date, priority, account_id, monthly_contribution_cents
      ) values (
        ${userId}, ${dados.name}, ${dados.kind}, ${dados.targetCents}, ${dados.targetDate},
        ${dados.priority}, ${dados.accountId}, ${dados.monthlyContributionCents}
      )
      returning *
    `
    return paraMeta(linha)
  })
}

/** Refusa alterar meta encerrada (concluída ou arquivada): o plano dela já fechou. */
export async function alterarMeta(userId: string, metaId: string, dados: DadosMeta): Promise<void> {
  await comoUsuario(userId, async (sql) => {
    const [linha] = await sql`
      update goals set
        name = ${dados.name}, kind = ${dados.kind}, target_cents = ${dados.targetCents},
        target_date = ${dados.targetDate}, priority = ${dados.priority},
        account_id = ${dados.accountId}, monthly_contribution_cents = ${dados.monthlyContributionCents},
        updated_at = now()
      where id = ${metaId} and completed_at is null and archived_at is null
      returning id
    `
    if (!linha) throw new Error('Meta não encontrada ou já encerrada')
  })
}

async function inserirMovimento(
  userId: string,
  metaId: string,
  accountId: string,
  amountCents: Cents,
  kind: AllocationKind,
  occurredOn: IsoDate,
): Promise<void> {
  try {
    await comoUsuario(userId, (sql) => sql`
      insert into goal_allocations (user_id, goal_id, account_id, amount_cents, kind, occurred_on)
      values (${userId}, ${metaId}, ${accountId}, ${amountCents}, ${kind}, ${occurredOn})
    `)
  } catch (erro) {
    throw await traduzirErro(userId, metaId, accountId, erro)
  }
}

/** O reservado atual da meta numa conta: soma dos movimentos dela ali. */
async function reservaDaMeta(userId: string, metaId: string, accountId: string): Promise<Cents> {
  return comoUsuario(userId, async (sql) => {
    const [linha] = await sql<{ total: string }[]>`
      select coalesce(sum(amount_cents), 0)::text as total
      from goal_allocations
      where goal_id = ${metaId} and account_id = ${accountId}
    `
    return cents(Number(linha.total))
  })
}

/**
 * Traduz a mensagem do gatilho da migração 011 (spec 4.2 e 7) no erro de
 * formulário. Qualquer outra falha sobe como veio.
 */
async function traduzirErro(
  userId: string,
  metaId: string,
  accountId: string,
  erro: unknown,
): Promise<Error> {
  const mensagem = (erro as { message?: string }).message ?? ''

  if (mensagem.includes('não recebe aporte')) {
    return new ReservaRecusadaError('encerrada', null)
  }
  if (mensagem.includes('Movimento maior que o reservado')) {
    const reserva = await reservaDaMeta(userId, metaId, accountId)
    return new ReservaRecusadaError('reserva', reserva)
  }
  if (mensagem.includes('Aporte maior que o saldo sem reserva')) {
    const disponivel = await naoReservado(userId, accountId)
    return new ReservaRecusadaError('saldo', disponivel)
  }
  return erro as Error
}

export async function aportar(
  userId: string,
  metaId: string,
  m: { accountId: string; amountCents: Cents; occurredOn: IsoDate },
): Promise<void> {
  if (!Number.isInteger(m.amountCents) || m.amountCents <= 0) {
    throw new Error('O aporte precisa ser maior que zero')
  }
  await inserirMovimento(userId, metaId, m.accountId, m.amountCents, 'aporte', m.occurredOn)
}

/** `amountCents` positivo; grava negativo (resgate reduz a reserva). */
export async function resgatar(
  userId: string,
  metaId: string,
  m: { accountId: string; amountCents: Cents; occurredOn: IsoDate },
): Promise<void> {
  if (!Number.isInteger(m.amountCents) || m.amountCents <= 0) {
    throw new Error('O resgate precisa ser maior que zero')
  }
  await inserirMovimento(userId, metaId, m.accountId, cents(-m.amountCents), 'resgate', m.occurredOn)
}

/**
 * Grava a data e libera a reserva, na mesma transação (spec 7). Primeiro a
 * meta, depois uma `liberacao` por conta com reserva > 0, em ordem de conta:
 * mesma ordem de travas do gatilho, para não trancar com um aporte
 * concorrente.
 */
async function encerrarMeta(
  userId: string,
  metaId: string,
  hoje: IsoDate,
  campo: 'completed_at' | 'archived_at',
): Promise<void> {
  await comoUsuario(userId, async (sql) => {
    const [linha] = await sql`
      update goals set ${sql({ [campo]: hoje })}, updated_at = now()
      where id = ${metaId} and completed_at is null and archived_at is null
      returning id
    `
    if (!linha) throw new Error('Meta não encontrada ou já encerrada')

    const reservas = await sql<{ account_id: string; total: string }[]>`
      select account_id, sum(amount_cents)::text as total
      from goal_allocations
      where goal_id = ${metaId}
      group by account_id
      having sum(amount_cents) > 0
      order by account_id
    `

    for (const reserva of reservas) {
      await sql`
        insert into goal_allocations (user_id, goal_id, account_id, amount_cents, kind, occurred_on)
        values (${userId}, ${metaId}, ${reserva.account_id}, ${cents(-Number(reserva.total))}, 'liberacao', ${hoje})
      `
    }
  })
}

export function concluirMeta(userId: string, metaId: string, hoje: IsoDate): Promise<void> {
  return encerrarMeta(userId, metaId, hoje, 'completed_at')
}

export function arquivarMeta(userId: string, metaId: string, hoje: IsoDate): Promise<void> {
  return encerrarMeta(userId, metaId, hoje, 'archived_at')
}

interface LinhaMovimento {
  id: string
  account_id: string
  account_name: string
  kind: AllocationKind
  amount_cents: string
  occurred_on: Date
}

interface LinhaMovimentoComMeta extends LinhaMovimento {
  goal_id: string
}

/**
 * Reserva acima do saldo, por conta (spec 3.3): soma das reservas ativas
 * (todas as metas não encerradas) menos o saldo atual, travada em zero. É
 * conta a conta, não meta a meta: aparece em qualquer meta com reserva ali.
 */
async function acimaDoSaldoPorConta(sql: postgres.TransactionSql): Promise<Map<string, Cents>> {
  const reservas = await sql<{ account_id: string; total: string }[]>`
    select a.account_id, sum(a.amount_cents)::text as total
    from goal_allocations a
    join goals g on g.id = a.goal_id
    where g.completed_at is null and g.archived_at is null
    group by a.account_id
  `
  if (reservas.length === 0) return new Map()

  const contas = reservas.map((r) => r.account_id)
  const saldos = await sql<{ account_id: string; balance_cents: string }[]>`
    select account_id, balance_cents from account_balances where account_id in ${sql(contas)}
  `
  const saldoPorConta = new Map(saldos.map((s) => [s.account_id, Number(s.balance_cents)]))

  return new Map(
    reservas.map((r) => {
      const saldo = saldoPorConta.get(r.account_id) ?? 0
      return [r.account_id, cents(Math.max(0, Number(r.total) - saldo))] as const
    }),
  )
}

function construirMetaAvaliada(
  meta: Meta,
  linhas: LinhaMovimento[],
  acimaDoSaldo: Map<string, Cents>,
  hoje: IsoDate,
  diaInicio: number,
): MetaAvaliada {
  const movimentos: Movimento[] = linhas.map((linha) => ({
    amountCents: cents(Number(linha.amount_cents)),
    kind: linha.kind,
    occurredOn: dataOuNulo(linha.occurred_on)!,
    accountId: linha.account_id,
  }))

  const reservado = cents(movimentos.reduce((soma, m) => soma + m.amountCents, 0))

  const porConta = new Map<string, { accountName: string; reservado: number }>()
  for (const linha of linhas) {
    const atual = porConta.get(linha.account_id) ?? { accountName: linha.account_name, reservado: 0 }
    atual.reservado += Number(linha.amount_cents)
    porConta.set(linha.account_id, atual)
  }

  const reservasPorConta = [...porConta.entries()]
    .filter(([, valor]) => valor.reservado !== 0)
    .map(([accountId, valor]) => ({
      accountId,
      accountName: valor.accountName,
      reservado: cents(valor.reservado),
      acimaDoSaldo: acimaDoSaldo.get(accountId) ?? cents(0),
    }))

  const avaliacao = avaliarMeta({
    alvo: meta.targetCents,
    reservado,
    dataAlvo: meta.targetDate,
    planejado: meta.monthlyContributionCents,
    movimentos,
    hoje,
    diaInicio,
  })

  return { ...meta, reservado, reservasPorConta, avaliacao }
}

/**
 * Metas ativas avaliadas e encerradas separadas (spec 7). Os movimentos
 * levados a `avaliarMeta` são todos os da meta: o domínio filtra a janela
 * dos três meses para o ritmo.
 */
export async function listarMetas(
  userId: string,
  hoje: IsoDate,
  diaInicio: number,
): Promise<{ ativas: MetaAvaliada[]; encerradas: Meta[] }> {
  return comoUsuario(userId, async (sql) => {
    const linhasMetas = await sql`select * from goals`
    const metas = linhasMetas.map(paraMeta)

    const ativas = metas.filter((m) => m.completedAt === null && m.archivedAt === null)
    const encerradas = metas
      .filter((m) => m.completedAt !== null || m.archivedAt !== null)
      .sort(compararEncerradas)

    if (ativas.length === 0) {
      return { ativas: [], encerradas }
    }

    const metaIds = ativas.map((m) => m.id)
    const movimentos = await sql<LinhaMovimentoComMeta[]>`
      select ga.id, ga.goal_id, ga.account_id, acc.name as account_name, ga.kind, ga.amount_cents, ga.occurred_on
      from goal_allocations ga
      join accounts acc on acc.id = ga.account_id
      where ga.goal_id in ${sql(metaIds)}
      order by ga.occurred_on, ga.created_at
    `

    const porMeta = new Map<string, LinhaMovimento[]>()
    for (const linha of movimentos) {
      const lista = porMeta.get(linha.goal_id) ?? []
      lista.push(linha)
      porMeta.set(linha.goal_id, lista)
    }

    const acimaDoSaldo = await acimaDoSaldoPorConta(sql)

    const metasAvaliadas = ativas
      .map((meta) => construirMetaAvaliada(meta, porMeta.get(meta.id) ?? [], acimaDoSaldo, hoje, diaInicio))
      .sort(compararMetas)

    return { ativas: metasAvaliadas, encerradas }
  })
}

/** A meta com o histórico de movimentos, em ordem de data (spec 7 e tela de detalhe). */
export async function buscarMeta(
  userId: string,
  metaId: string,
  hoje: IsoDate,
  diaInicio: number,
): Promise<{ meta: MetaAvaliada; movimentos: MovimentoMeta[] } | null> {
  return comoUsuario(userId, async (sql) => {
    const [linhaMeta] = await sql`select * from goals where id = ${metaId}`
    if (!linhaMeta) return null
    const meta = paraMeta(linhaMeta)

    const linhas = await sql<LinhaMovimento[]>`
      select ga.id, ga.goal_id, ga.account_id, acc.name as account_name, ga.kind, ga.amount_cents, ga.occurred_on
      from goal_allocations ga
      join accounts acc on acc.id = ga.account_id
      where ga.goal_id = ${metaId}
      order by ga.occurred_on, ga.created_at
    `

    const acimaDoSaldo = await acimaDoSaldoPorConta(sql)
    const metaAvaliada = construirMetaAvaliada(meta, linhas, acimaDoSaldo, hoje, diaInicio)

    const movimentos: MovimentoMeta[] = linhas.map((linha) => ({
      id: linha.id,
      amountCents: cents(Number(linha.amount_cents)),
      kind: linha.kind,
      occurredOn: dataOuNulo(linha.occurred_on)!,
      accountId: linha.account_id,
      accountName: linha.account_name,
    }))

    return { meta: metaAvaliada, movimentos }
  })
}

/** Total reservado ativo por conta (spec 7), para a tela de contas e a fatia 5. */
export async function reservasPorConta(userId: string): Promise<Map<string, Cents>> {
  return comoUsuario(userId, async (sql) => {
    const linhas = await sql<{ account_id: string; total: string }[]>`
      select a.account_id, sum(a.amount_cents)::text as total
      from goal_allocations a
      join goals g on g.id = a.goal_id
      where g.completed_at is null and g.archived_at is null
      group by a.account_id
      having sum(a.amount_cents) <> 0
    `
    return new Map(linhas.map((linha) => [linha.account_id, cents(Number(linha.total))]))
  })
}

/** Saldo atual menos as reservas ativas da conta (spec 3.3), o limite do aporte. */
export async function naoReservado(userId: string, accountId: string): Promise<Cents> {
  return comoUsuario(userId, async (sql) => {
    const [saldo] = await sql<{ balance_cents: string }[]>`
      select balance_cents from account_balances where account_id = ${accountId}
    `
    if (!saldo) throw new Error('Conta não encontrada')

    const [reservas] = await sql<{ total: string }[]>`
      select coalesce(sum(a.amount_cents), 0)::text as total
      from goal_allocations a
      join goals g on g.id = a.goal_id
      where a.account_id = ${accountId} and g.completed_at is null and g.archived_at is null
    `

    return cents(Number(saldo.balance_cents) - Number(reservas.total))
  })
}
