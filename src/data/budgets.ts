import { comoUsuario } from './with-user'
import { dataOuNulo } from './transactions'
import { mesFinanceiro } from '../domain/dates'
import { cents } from '../domain/money'
import {
  avaliar,
  disponiveis,
  limiteVigente,
  periodosEntre,
  type Avaliacao,
  type Limite,
  type Periodo,
} from '../domain/budget'
import type { Cents, IsoDate } from '../domain/types'

/**
 * Orçamentos (spec da fatia 3). O cálculo é do domínio; aqui só se lê e se
 * grava. Gasto é sempre de despesa, por competência, somado na
 * categoria-raiz.
 */

export interface Orcamento {
  id: string
  categoryId: string
  rollover: boolean
  rolloverSince: IsoDate | null
  limites: Limite[]
}

export interface ItemOrcamento {
  orcamentoId: string
  categoriaId: string
  nome: string
  /** Limite em vigor no período. */
  limite: Cents
  /** Limite mais a sobra acumulada, quando a acumulação está ligada. */
  disponivel: Cents
  realizado: Cents
  realizadoVariavel: Cents
  comprometido: Cents
  rollover: boolean
  avaliacao: Avaliacao
}

export interface GastoSemOrcamento {
  categoriaId: string
  nome: string
  realizado: Cents
  comprometido: Cents
}

export interface ResumoOrcamento {
  periodo: Periodo
  itens: ItemOrcamento[]
  semOrcamento: GastoSemOrcamento[]
  totais: {
    disponivel: Cents
    realizadoComOrcamento: Cents
    comprometidoComOrcamento: Cents
    restante: Cents
    realizadoSemOrcamento: Cents
  }
}

export async function criarOrcamento(
  userId: string,
  dados: { categoryId: string; amountCents: Cents; aPartirDe: IsoDate; rollover?: boolean },
): Promise<Orcamento> {
  validarValor(dados.amountCents)

  return comoUsuario(userId, async (sql) => {
    const rollover = dados.rollover ?? false
    const [linha] = await sql`
      insert into budgets (user_id, category_id, rollover, rollover_since)
      values (${userId}, ${dados.categoryId}, ${rollover}, ${rollover ? dados.aPartirDe : null})
      returning *
    `
    await sql`
      insert into budget_limits (user_id, budget_id, starts_on, amount_cents)
      values (${userId}, ${linha.id}, ${dados.aPartirDe}, ${dados.amountCents})
    `
    return {
      id: linha.id as string,
      categoryId: linha.category_id as string,
      rollover,
      rolloverSince: dataOuNulo(linha.rollover_since),
      limites: [{ startsOn: dados.aPartirDe, amountCents: dados.amountCents }],
    }
  })
}

/**
 * Muda o limite do período `aPartirDe` em diante. Os períodos anteriores
 * continuam com o limite que tinham (spec 4.2). Mudar duas vezes o mesmo
 * período atualiza a mesma linha.
 */
export async function alterarLimite(
  userId: string,
  budgetId: string,
  amountCents: Cents,
  aPartirDe: IsoDate,
): Promise<void> {
  validarValor(amountCents)
  await comoUsuario(userId, (sql) => sql`
    insert into budget_limits (user_id, budget_id, starts_on, amount_cents)
    values (${userId}, ${budgetId}, ${aPartirDe}, ${amountCents})
    on conflict (budget_id, starts_on)
      do update set amount_cents = excluded.amount_cents, updated_at = now()
  `)
}

/** Liga ou desliga a acumulação; ligada, vale a partir de `aPartirDe`. */
export async function definirAcumulacao(
  userId: string,
  budgetId: string,
  ligado: boolean,
  aPartirDe: IsoDate,
): Promise<void> {
  await comoUsuario(userId, (sql) => sql`
    update budgets
    set rollover = ${ligado}, rollover_since = ${ligado ? aPartirDe : null}, updated_at = now()
    where id = ${budgetId} and archived_at is null
  `)
}

/** Remover é arquivar: o histórico de limites fica. */
export async function removerOrcamento(userId: string, budgetId: string): Promise<void> {
  await comoUsuario(userId, (sql) => sql`
    update budgets set archived_at = now(), updated_at = now()
    where id = ${budgetId} and archived_at is null
  `)
}

function validarValor(valor: Cents): void {
  if (!Number.isInteger(valor) || valor < 0) {
    throw new Error('O limite precisa ser zero ou mais')
  }
}

/**
 * O orçamento de um período. Uma consulta agrupa o gasto por categoria-raiz,
 * data e natureza, desde o início da acumulação mais antiga; o domínio
 * distribui pelos períodos. Sem acumulação, a consulta cobre só o período.
 */
export async function resumoOrcamento(
  userId: string,
  periodo: Periodo,
  hoje: IsoDate,
  diaInicio: number,
): Promise<ResumoOrcamento> {
  return comoUsuario(userId, async (sql) => {
    const orcamentos = await sql<
      { id: string; category_id: string; rollover: boolean; rollover_since: Date | null }[]
    >`select id, category_id, rollover, rollover_since from budgets where archived_at is null`

    const limitesRaw = orcamentos.length
      ? await sql<{ budget_id: string; starts_on: Date; amount_cents: string }[]>`
          select budget_id, starts_on, amount_cents from budget_limits
          where budget_id in ${sql(orcamentos.map((o) => o.id))}
        `
      : []

    const categorias = await sql<{ id: string; name: string; is_archived: boolean }[]>`
      select id, name, is_archived from categories
      where kind = 'despesa' and parent_id is null
      order by sort_order, lower(name)
    `

    // A acumulação mais antiga define até onde a consulta precisa voltar.
    const inicios = orcamentos
      .filter((o) => o.rollover && o.rollover_since)
      .map((o) => dataOuNulo(o.rollover_since)!)
    const desde = [periodo.inicio, ...inicios].sort()[0]

    const gastos = await sql<
      { raiz: string; competence_date: Date; realizado: boolean; variavel: boolean; total: string }[]
    >`
      select coalesce(c.parent_id, c.id) as raiz,
             t.competence_date,
             t.status in ('liquidado', 'conciliado') as realizado,
             t.nature = 'variavel' as variavel,
             sum(t.amount_cents)::text as total
      from transactions t
      join categories c on c.id = t.category_id
      where t.kind = 'despesa'
        and t.status in ('liquidado', 'conciliado', 'previsto', 'pendente')
        and t.competence_date between ${desde} and ${periodo.fim}
      group by 1, 2, 3, 4
    `

    // Soma por raiz e por período (início do período como chave).
    type Soma = { realizado: number; variavel: number; comprometido: number }
    const porRaiz = new Map<string, Map<string, Soma>>()
    for (const g of gastos) {
      const chave = mesFinanceiro(dataOuNulo(g.competence_date)!, diaInicio).inicio
      const doPeriodo = porRaiz.get(g.raiz) ?? new Map<string, Soma>()
      const soma = doPeriodo.get(chave) ?? { realizado: 0, variavel: 0, comprometido: 0 }
      const valor = Number(g.total)
      if (g.realizado) {
        soma.realizado += valor
        if (g.variavel) soma.variavel += valor
      } else {
        soma.comprometido += valor
      }
      doPeriodo.set(chave, soma)
      porRaiz.set(g.raiz, doPeriodo)
    }

    const somaDe = (raiz: string, inicio: string): Soma =>
      porRaiz.get(raiz)?.get(inicio) ?? { realizado: 0, variavel: 0, comprometido: 0 }

    const itens: ItemOrcamento[] = []
    const comOrcamento = new Set<string>()

    for (const o of orcamentos) {
      const limites: Limite[] = limitesRaw
        .filter((l) => l.budget_id === o.id)
        .map((l) => ({ startsOn: dataOuNulo(l.starts_on)!, amountCents: cents(Number(l.amount_cents)) }))

      const limite = limiteVigente(limites, periodo.inicio)
      // Orçamento que só começa depois deste período não vale aqui.
      if (limite === null) continue

      const rolloverSince = o.rollover ? dataOuNulo(o.rollover_since) : null
      const periodos = periodosEntre(rolloverSince && rolloverSince < periodo.inicio ? rolloverSince : periodo.inicio, periodo.inicio, diaInicio)
      const realizado = new Map(periodos.map((p) => [p.inicio as string, cents(somaDe(o.category_id, p.inicio).realizado)]))
      const disponivel = disponiveis({ periodos, limites, rolloverSince, realizado }).get(periodo.inicio) ?? limite

      const soma = somaDe(o.category_id, periodo.inicio)
      const categoria = categorias.find((c) => c.id === o.category_id)
      comOrcamento.add(o.category_id)

      itens.push({
        orcamentoId: o.id,
        categoriaId: o.category_id,
        nome: categoria?.name ?? 'Categoria',
        limite,
        disponivel,
        realizado: cents(soma.realizado),
        realizadoVariavel: cents(soma.variavel),
        comprometido: cents(soma.comprometido),
        rollover: o.rollover,
        avaliacao: avaliar({
          disponivel,
          realizado: cents(soma.realizado),
          realizadoVariavel: cents(soma.variavel),
          comprometido: cents(soma.comprometido),
          periodo,
          hoje,
        }),
      })
    }

    // Toda raiz sem orçamento aparece, mesmo sem gasto, para poder ganhar um.
    // Raiz arquivada só aparece se gastou no período.
    const semOrcamento: GastoSemOrcamento[] = categorias
      .filter((c) => !comOrcamento.has(c.id))
      .map((c) => {
        const soma = somaDe(c.id, periodo.inicio)
        return {
          categoriaId: c.id,
          nome: c.name,
          realizado: cents(soma.realizado),
          comprometido: cents(soma.comprometido),
          arquivada: c.is_archived,
        }
      })
      .filter((c) => !c.arquivada || c.realizado > 0 || c.comprometido > 0)
      .map(({ arquivada: _arquivada, ...resto }) => resto)

    const somar = (valores: number[]) => cents(valores.reduce((total, v) => total + v, 0))
    const disponivelTotal = somar(itens.map((i) => i.disponivel))
    const realizadoCom = somar(itens.map((i) => i.realizado))
    const comprometidoCom = somar(itens.map((i) => i.comprometido))

    return {
      periodo,
      itens,
      semOrcamento,
      totais: {
        disponivel: disponivelTotal,
        realizadoComOrcamento: realizadoCom,
        comprometidoComOrcamento: comprometidoCom,
        restante: cents(disponivelTotal - realizadoCom - comprometidoCom),
        realizadoSemOrcamento: somar(semOrcamento.map((s) => s.realizado)),
      },
    }
  })
}
