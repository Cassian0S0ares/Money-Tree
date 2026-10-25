import type postgres from 'postgres'
import { comoUsuario } from './with-user'
import { dataOuNulo, paraLancamento, type Lancamento } from './transactions'
import { somarDias } from '../domain/dates'
import { cents } from '../domain/money'
import { assertTransicao, estaAtrasado } from '../domain/transaction'
import {
  RegraInvalidaError,
  ocorrencias,
  planejarEdicaoSerie,
  proximaOcorrencia,
  validarRegra,
  valorIncomum,
  type AvisoValorIncomum,
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

  // As mesmas regras do CHECK do banco, com mensagem que a pessoa entende.
  if (dados.kind === 'transferencia') {
    if (!dados.toAccountId) throw new RegraInvalidaError('Escolha a conta de destino')
    if (dados.toAccountId === dados.accountId) {
      throw new RegraInvalidaError('Origem e destino precisam ser contas diferentes')
    }
  } else if (!dados.nature) {
    throw new RegraInvalidaError('Informe se é fixa ou variável')
  }
  if (!Number.isInteger(dados.amountCents) || dados.amountCents <= 0) {
    throw new RegraInvalidaError('O valor precisa ser maior que zero')
  }
  if (!dados.description.trim()) throw new RegraInvalidaError('Informe uma descrição')

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

/**
 * Regras com o próximo vencimento. Quando a próxima ocorrência ainda não foi
 * gerada (além dos 90 dias, como o IPVA de março visto em outubro), a data
 * vem do cálculo da regra.
 */
export async function listarRegras(userId: string, hoje?: IsoDate): Promise<RegraComProxima[]> {
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
    return linhas.map((linha) => {
      const regra = paraRegra(linha)
      const gerada = dataOuNulo(linha.proximo_vencimento)
      const calculada =
        !gerada && hoje && regra.status === 'ativa' ? proximaOcorrencia(regra, hoje)?.vencimento ?? null : null
      return { ...regra, proximoVencimento: gerada ?? calculada }
    })
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

/** Ocorrência pelo id, com as linhas do grupo (os dois lados, na transferência). */
async function lerOcorrencia(
  sql: postgres.TransactionSql,
  id: string,
): Promise<{ alvo: Lancamento; lados: Lancamento[]; regra: Regra }> {
  const linhas = await sql`
    select * from transactions
    where id = ${id}
       or transfer_group_id = (select transfer_group_id from transactions where id = ${id})
    for update
  `
  const lados = linhas.map(paraLancamento)
  const alvo = lados.find((lado) => lado.id === id)
  if (!alvo || !alvo.recurrenceRuleId) throw new Error('Ocorrência não encontrada')

  const [regra] = await sql`select * from recurrence_rules where id = ${alvo.recurrenceRuleId}`
  return { alvo, lados, regra: paraRegra(regra) }
}

/** Pular é cancelar: a linha fica e impede a geração de recriá-la. */
export async function pularOcorrencia(userId: string, id: string): Promise<void> {
  await comoUsuario(userId, async (sql) => {
    const { lados } = await lerOcorrencia(sql, id)
    for (const lado of lados) assertTransicao(lado.status, 'cancelado')
    await sql`
      update transactions set status = 'cancelado', updated_at = now()
      where id in ${sql(lados.map((lado) => lado.id))}
    `
  })
}

export interface EdicaoOcorrencia {
  description?: string
  amountCents?: Cents
  dueDate?: IsoDate
  competenceDate?: IsoDate
  categoryId?: string | null
}

/**
 * "Só esta" (spec 6.4). Marca a ocorrência como exceção, e a série nunca
 * mais mexe nela. Ocorrência paga é recusada pelo gatilho de imutabilidade:
 * a correção dela é estorno.
 */
export async function editarOcorrencia(
  userId: string,
  id: string,
  dados: EdicaoOcorrencia,
): Promise<Lancamento> {
  return comoUsuario(userId, async (sql) => {
    const { lados } = await lerOcorrencia(sql, id)

    const colunas: Record<string, unknown> = { is_exception: true, updated_at: new Date() }
    if (dados.description !== undefined) colunas.description = dados.description
    if (dados.amountCents !== undefined) colunas.amount_cents = dados.amountCents
    if (dados.dueDate !== undefined) colunas.due_date = dados.dueDate
    if (dados.competenceDate !== undefined) colunas.competence_date = dados.competenceDate
    // Transferência não leva categoria; nos dois lados, ela fica como está.
    if (dados.categoryId !== undefined && lados.length === 1) colunas.category_id = dados.categoryId

    const atualizadas = await sql`
      update transactions set ${sql(colunas)}
      where id in ${sql(lados.map((lado) => lado.id))}
      returning *
    `
    return paraLancamento(atualizadas.find((linha) => linha.id === id)!)
  })
}

/**
 * Paga a ocorrência com o valor real. Valor e estado mudam na mesma
 * instrução, enquanto a linha ainda é prevista: depois de liquidada, o
 * gatilho de imutabilidade não deixaria mudar o valor. Na transferência,
 * os dois lados.
 */
export async function pagarOcorrencia(
  userId: string,
  id: string,
  pagamento: { valor: Cents; quando: IsoDate },
): Promise<{ lancamento: Lancamento; aviso: AvisoValorIncomum | null }> {
  if (!Number.isInteger(pagamento.valor) || pagamento.valor <= 0) {
    throw new Error('O valor pago precisa ser maior que zero')
  }

  return comoUsuario(userId, async (sql) => {
    const { alvo, lados, regra } = await lerOcorrencia(sql, id)
    for (const lado of lados) assertTransicao(lado.status, 'liquidado')

    const anteriores = await sql<{ amount_cents: string }[]>`
      select amount_cents from transactions
      where recurrence_series_id = ${regra.seriesId}
        and status in ('liquidado', 'conciliado')
        and direction = ${alvo.direction}
        and id <> ${alvo.id}
      order by occurrence_date desc
      limit 3
    `

    const atualizadas = await sql`
      update transactions
      set amount_cents = ${pagamento.valor}, status = 'liquidado',
          settled_date = ${pagamento.quando}, updated_at = now()
      where id in ${sql(lados.map((lado) => lado.id))}
      returning *
    `

    return {
      lancamento: paraLancamento(atualizadas.find((linha) => linha.id === id)!),
      aviso: valorIncomum(
        pagamento.valor,
        anteriores.map((linha) => cents(Number(linha.amount_cents))),
      ),
    }
  })
}

/** Apaga as ocorrências futuras que a série ainda pode substituir. */
async function apagarFuturasNaoTocadas(
  sql: postgres.TransactionSql,
  regraId: string,
  aPartirDe: IsoDate,
): Promise<void> {
  await sql`
    delete from transactions
    where recurrence_rule_id = ${regraId}
      and status = 'previsto'
      and not is_exception
      and occurrence_date >= ${aPartirDe}
  `
}

/**
 * Pausa: as futuras não tocadas somem e a geração para. As atrasadas ficam,
 * porque continuam devidas.
 */
export async function pausarRegra(userId: string, id: string, hoje: IsoDate): Promise<void> {
  await comoUsuario(userId, async (sql) => {
    const [linha] = await sql`
      update recurrence_rules set status = 'pausada', paused_at = ${hoje}, updated_at = now()
      where id = ${id} and status = 'ativa'
      returning id
    `
    if (!linha) throw new Error('Só uma recorrência ativa pode ser pausada')
    await apagarFuturasNaoTocadas(sql, id, hoje)
  })
}

/** Retoma de hoje em diante: a janela pausada não é preenchida para trás. */
export async function retomarRegra(userId: string, id: string, hoje: IsoDate): Promise<void> {
  await comoUsuario(userId, async (sql) => {
    const [linha] = await sql`
      update recurrence_rules
      set status = 'ativa', paused_at = null, generated_until = ${somarDias(hoje, -1)}, updated_at = now()
      where id = ${id} and status = 'pausada'
      returning id
    `
    if (!linha) throw new Error('Só uma recorrência pausada pode ser retomada')
  })
}

/**
 * Encerra de vez. A regra não é apagada (ocorrências pagas apontam para
 * ela) e não volta; para recomeçar, cria-se outra. O estado basta para
 * parar a geração, sem mexer em `end_date`, que conflitaria com um fim por
 * número de vezes.
 */
export async function encerrarRegra(userId: string, id: string, hoje: IsoDate): Promise<void> {
  await comoUsuario(userId, async (sql) => {
    const [linha] = await sql`
      update recurrence_rules set status = 'encerrada', paused_at = null, updated_at = now()
      where id = ${id} and status <> 'encerrada'
      returning id
    `
    if (!linha) throw new Error('Esta recorrência já está encerrada')
    await apagarFuturasNaoTocadas(sql, id, hoje)
  })
}

export type MudancasSerie = Partial<
  Pick<
    NovaRegra,
    | 'description' | 'amountCents' | 'amountIsEstimate' | 'accountId' | 'toAccountId'
    | 'categoryId' | 'nature' | 'unit' | 'interval' | 'startDate' | 'weekendPolicy'
  >
>

/**
 * "Desta em diante" (spec 6.4), a partir da ocorrência `ocorrenciaId`.
 * O plano vem do domínio; aqui só se executa. Nada que foi pago, pulado ou
 * editado sozinho é alterado (T19): o gatilho de imutabilidade é a segunda
 * defesa, e a chave única na série impede a regra nova de recriar datas
 * ocupadas.
 */
export async function editarDestaEmDiante(
  userId: string,
  ocorrenciaId: string,
  mudancas: MudancasSerie,
  hoje: IsoDate,
): Promise<Regra> {
  return comoUsuario(userId, async (sql) => {
    const { alvo, regra } = await lerOcorrencia(sql, ocorrenciaId)
    const aPartirDe = alvo.occurrenceDate!

    const existentes = (
      await sql`select * from transactions where recurrence_rule_id = ${regra.id}`
    ).map(paraLancamento)

    const plano = planejarEdicaoSerie({
      regra,
      aPartirDe,
      ocorrencias: existentes.map((o) => ({
        id: o.id, nominal: o.occurrenceDate!, status: o.status, isException: o.isException,
      })),
    })

    const inicio = mudancas.startDate ?? aPartirDe
    const mudouDia = mudancas.startDate !== undefined || mudancas.unit !== undefined
    const nova = normalizarRegra({
      kind: regra.kind,
      description: mudancas.description ?? regra.description,
      accountId: mudancas.accountId ?? regra.accountId,
      toAccountId: mudancas.toAccountId !== undefined ? mudancas.toAccountId : regra.toAccountId,
      categoryId: mudancas.categoryId !== undefined ? mudancas.categoryId : regra.categoryId,
      nature: mudancas.nature !== undefined ? mudancas.nature : regra.nature,
      amountCents: mudancas.amountCents ?? regra.amountCents,
      amountIsEstimate: mudancas.amountIsEstimate ?? regra.amountIsEstimate,
      unit: mudancas.unit ?? regra.unit,
      interval: mudancas.interval ?? regra.interval,
      startDate: inicio,
      // Sem mudança de data ou de unidade, preserva o dia pretendido: o
      // aluguel "todo dia 31" cortado em 30 de abril continua sendo do 31.
      dayOfMonth: mudouDia ? null : regra.dayOfMonth,
      endDate: regra.endDate !== null && regra.endDate >= inicio ? regra.endDate : null,
      maxOccurrences: plano.restantes,
      weekendPolicy: mudancas.weekendPolicy ?? regra.weekendPolicy,
    })

    if (nova.startDate < somarDias(hoje, -PASSADO_MAX_DIAS)) {
      throw new RegraInvalidaError(
        `A nova primeira ocorrência pode ser no máximo ${PASSADO_MAX_DIAS} dias atrás`,
      )
    }

    if (plano.apagar.length > 0) {
      await sql`delete from transactions where id in ${sql(plano.apagar)} and status = 'previsto'`
    }

    const colunas = {
      description: nova.description,
      account_id: nova.accountId,
      to_account_id: nova.toAccountId ?? null,
      category_id: nova.categoryId ?? null,
      nature: nova.nature ?? null,
      amount_cents: nova.amountCents,
      amount_is_estimate: nova.amountIsEstimate ?? false,
      unit: nova.unit,
      interval_count: nova.interval,
      start_date: nova.startDate,
      day_of_month: nova.dayOfMonth,
      end_date: nova.endDate,
      max_occurrences: nova.maxOccurrences,
      weekend_policy: nova.weekendPolicy,
    }

    if (plano.modo === 'substituir') {
      const [linha] = await sql`
        update recurrence_rules
        set ${sql(colunas)}, generated_until = null, updated_at = now()
        where id = ${regra.id}
        returning *
      `
      return paraRegra(linha)
    }

    // A antiga termina na véspera. Termina por data, então o fim por número
    // de vezes sai (os dois não coexistem), sem mudar o que ela já gerou.
    await sql`
      update recurrence_rules
      set end_date = ${plano.fimDaAntiga}, max_occurrences = null, updated_at = now()
      where id = ${regra.id}
    `
    const [linha] = await sql`
      insert into recurrence_rules ${sql({
        ...colunas,
        user_id: userId,
        kind: regra.kind,
        series_id: regra.seriesId,
        status: regra.status === 'pausada' ? 'ativa' : regra.status,
      })}
      returning *
    `
    return paraRegra(linha)
  })
}

export interface ContaProxima extends Lancamento {
  atrasado: boolean
  /** Valor ainda estimado: ocorrência de regra de valor variável. */
  estimado: boolean
}

/**
 * Previstos e pendentes com vencimento até `hoje + dias`, atrasados
 * primeiro. As somas separam pagar e receber e deixam transferência de
 * fora, porque transferência não é gasto. Não é dinheiro livre: esse
 * cálculo é da fatia 5.
 */
export async function proximasContas(
  userId: string,
  hoje: IsoDate,
  dias: number,
): Promise<{ itens: ContaProxima[]; aPagar: Cents; aReceber: Cents }> {
  const ate = somarDias(hoje, dias)

  const itens = await comoUsuario(userId, async (sql) => {
    const linhas = await sql`
      select t.*, coalesce(r.amount_is_estimate, false) as estimado
      from transactions t
      left join recurrence_rules r on r.id = t.recurrence_rule_id
      where t.status in ('previsto', 'pendente')
        and coalesce(t.due_date, t.competence_date) <= ${ate}
      order by coalesce(t.due_date, t.competence_date), t.kind, t.direction
    `
    return linhas.map((linha) => {
      const lancamento = paraLancamento(linha)
      return {
        ...lancamento,
        atrasado: estaAtrasado(lancamento, hoje),
        estimado: linha.estimado as boolean,
      }
    })
  })

  // Atrasadas primeiro; dentro de cada grupo, a ordem do vencimento.
  itens.sort((a, b) => Number(b.atrasado) - Number(a.atrasado))

  const somar = (kind: 'receita' | 'despesa') =>
    cents(itens.filter((i) => i.kind === kind).reduce((soma, i) => soma + i.amountCents, 0))

  return { itens, aPagar: somar('despesa'), aReceber: somar('receita') }
}
