import { periodoAnterior, periodosEntre, proximoPeriodo, type Periodo } from './budget'
import { mesFinanceiro } from './dates'
import { cents } from './money'
import type { Cents, IsoDate } from './types'

/**
 * Metas: progresso, meses restantes, contribuição necessária, ritmo e mês
 * provável (spec da fatia 4, seções 3.4 e 6.1–6.3). Cálculo puro sobre o que
 * o repositório entrega: reservado por meta, movimentos de alocação e hoje.
 */

export type GoalKind =
  | 'reserva_emergencia'
  | 'viagem'
  | 'compra'
  | 'quitacao_divida'
  | 'educacao'
  | 'longo_prazo'
  | 'livre'

export type GoalPriority = 'alta' | 'media' | 'baixa'

export type AllocationKind = 'aporte' | 'resgate' | 'liberacao'

export interface Movimento {
  amountCents: Cents
  kind: AllocationKind
  occurredOn: IsoDate
  accountId: string
}

/**
 * Quanto falta e o percentual alcançado (spec 6.1). Reservado pode passar do
 * alvo (a pessoa guardou mais do que precisava); falta trava em zero e o
 * percentual, em 100 — nunca aparece "120%" numa barra de progresso.
 */
export function progresso(
  alvo: Cents,
  reservado: Cents,
): { falta: Cents; percentual: number; atingida: boolean } {
  const falta = cents(Math.max(0, alvo - reservado))
  const percentual = Math.min(100, Math.max(0, Math.floor((reservado * 100) / alvo)))
  const atingida = reservado >= alvo

  return { falta, percentual, atingida }
}

/**
 * Períodos do atual (que contém `hoje`) até o último com início <= dataAlvo
 * (spec 3.4). Data-alvo antes de `hoje` é prazo vencido e conta 0, mesmo que
 * caia dentro do período atual: "restante" não pode ser positivo para um
 * prazo que já passou.
 */
export function mesesRestantes(hoje: IsoDate, dataAlvo: IsoDate, diaInicio: number): number {
  if (dataAlvo < hoje) return 0
  return periodosEntre(hoje, dataAlvo, diaInicio).length
}

/**
 * Contribuição mensal necessária para fechar a meta no prazo (spec 6.2).
 * Arredonda para cima: com o valor sugerido, a meta fecha exatamente ou
 * sobra. Sem meses restantes (sem data-alvo ou prazo vencido), não há
 * contribuição necessária.
 */
export function contribuicaoNecessaria(falta: Cents, meses: number): Cents | null {
  if (meses <= 0) return null
  return cents(Math.ceil(falta / meses))
}

export type Ritmo = { origem: 'planejado' | 'media'; valor: Cents } | null

/**
 * O ritmo de contribuição (spec 6.3): a contribuição planejada quando
 * positiva; senão, a média líquida (aportes − resgates, `liberacao` de fora)
 * dos três últimos meses financeiros *completos* — os três imediatamente
 * antes do período que contém `hoje`, nunca o período em andamento, que
 * ainda não fechou. Ritmo zero ou negativo é "sem ritmo para estimar".
 */
export function ritmo(
  planejado: Cents | null,
  movimentos: Movimento[],
  hoje: IsoDate,
  diaInicio: number,
): Ritmo {
  if (planejado !== null && planejado > 0) {
    return { origem: 'planejado', valor: planejado }
  }

  const atual = mesFinanceiro(hoje, diaInicio)
  const ultimoCompleto = periodoAnterior(atual, diaInicio)
  const primeiroCompleto = periodoAnterior(periodoAnterior(ultimoCompleto, diaInicio), diaInicio)

  let soma = 0
  for (const movimento of movimentos) {
    if (movimento.kind === 'liberacao') continue
    if (movimento.occurredOn < primeiroCompleto.inicio || movimento.occurredOn > ultimoCompleto.fim) continue
    soma += movimento.amountCents
  }

  // Trunca em direção a zero, como o mesmo centavo quebrado em outros cálculos.
  const media = Math.trunc(soma / 3)
  if (media <= 0) return null

  return { origem: 'media', valor: cents(media) }
}

/**
 * O mês financeiro em que a meta deve fechar, no ritmo atual (spec 6.3).
 * Falta zero fecha já no período atual, mesmo sem ritmo definido. Sem ritmo
 * e com falta positiva, não há como estimar.
 */
export function mesProvavel(falta: Cents, ritmo: Ritmo, hoje: IsoDate, diaInicio: number): Periodo | null {
  const atual = mesFinanceiro(hoje, diaInicio)
  if (falta === 0) return atual
  if (ritmo === null) return null

  const mesesParaConcluir = Math.ceil(falta / ritmo.valor)
  let periodo = atual
  for (let i = 0; i < mesesParaConcluir - 1; i++) {
    periodo = proximoPeriodo(periodo, diaInicio)
  }
  return periodo
}

/**
 * Soma das reservas ativas em contas com `includeInAvailable` (spec 6.6).
 * A fatia 5 usa isto para descontar do dinheiro livre exatamente uma vez:
 * reserva em conta já excluída do disponível (segregada) não entra aqui,
 * porque aquele dinheiro já não contava como livre.
 */
export function reservaParaDesconto(
  reservasPorConta: Map<string, Cents>,
  contas: { id: string; includeInAvailable: boolean }[],
): Cents {
  const incluidas = new Set(contas.filter((conta) => conta.includeInAvailable).map((conta) => conta.id))

  let total = 0
  for (const [contaId, valor] of reservasPorConta) {
    if (incluidas.has(contaId)) total += valor
  }

  return cents(total)
}
