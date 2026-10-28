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
  /** Positivo para `aporte`; negativo para `resgate` e `liberacao`. */
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

export type SituacaoMeta = 'atingida' | 'prazo_vencido' | 'fora_do_prazo' | 'no_prazo' | 'sem_prazo'

export interface OpcoesPrazo {
  /** Para fechar no prazo; nulo com prazo vencido (não restam meses). */
  aumentarContribuicao: Cents | null
  /** Reservado + ritmo × meses restantes; sem ritmo, só o reservado; nulo com prazo vencido. */
  reduzirAlvo: Cents | null
  /** Fim do mês provável; nulo sem ritmo (não há como estimar). */
  mudarData: IsoDate | null
}

export interface AvaliacaoMeta {
  falta: Cents
  percentual: number
  atingida: boolean
  mesesRestantes: number | null
  necessaria: Cents | null
  ritmo: Ritmo
  mesProvavel: Periodo | null
  situacao: SituacaoMeta
  /** Falta na data-alvo, no ritmo atual; só em fora_do_prazo e prazo_vencido. */
  faltariaNaData: Cents | null
  /** Períodos entre a data-alvo e o mês provável; só em fora_do_prazo com ritmo. */
  mesesDeAtraso: number | null
  /** Só quando fora_do_prazo ou prazo_vencido (spec 6.4). */
  opcoes: OpcoesPrazo | null
}

/** Conta passos de `proximoPeriodo`/`periodoAnterior` entre dois períodos; positivo quando `ate` vem depois de `de`. */
function diferencaEmPeriodos(de: Periodo, ate: Periodo, diaInicio: number): number {
  if (de.inicio === ate.inicio) return 0

  let passos = 0
  if (de.inicio < ate.inicio) {
    let periodo = de
    while (periodo.inicio < ate.inicio) {
      periodo = proximoPeriodo(periodo, diaInicio)
      passos++
    }
    return passos
  }

  let periodo = de
  while (periodo.inicio > ate.inicio) {
    periodo = periodoAnterior(periodo, diaInicio)
    passos++
  }
  return -passos
}

/**
 * Situação da meta, opções de prazo e o que faltaria na data-alvo (spec
 * 6.4, 6.7). Atingida vence qualquer outra situação. Sem data-alvo, não há
 * como estar no prazo, fora dele ou vencida: a meta fica "sem prazo".
 */
export function avaliarMeta(e: {
  alvo: Cents
  reservado: Cents
  dataAlvo: IsoDate | null
  planejado: Cents | null
  movimentos: Movimento[]
  hoje: IsoDate
  diaInicio: number
}): AvaliacaoMeta {
  const { alvo, reservado, dataAlvo, planejado, movimentos, hoje, diaInicio } = e
  const { falta, percentual, atingida } = progresso(alvo, reservado)

  if (atingida) {
    return {
      falta,
      percentual,
      atingida,
      mesesRestantes: dataAlvo === null ? null : mesesRestantes(hoje, dataAlvo, diaInicio),
      necessaria: null,
      ritmo: null,
      mesProvavel: mesFinanceiro(hoje, diaInicio),
      situacao: 'atingida',
      faltariaNaData: null,
      mesesDeAtraso: null,
      opcoes: null,
    }
  }

  if (dataAlvo === null) {
    const semData = ritmo(planejado, movimentos, hoje, diaInicio)
    return {
      falta,
      percentual,
      atingida,
      mesesRestantes: null,
      necessaria: null,
      ritmo: semData,
      mesProvavel: mesProvavel(falta, semData, hoje, diaInicio),
      situacao: 'sem_prazo',
      faltariaNaData: null,
      mesesDeAtraso: null,
      opcoes: null,
    }
  }

  const restantes = mesesRestantes(hoje, dataAlvo, diaInicio)
  const r = ritmo(planejado, movimentos, hoje, diaInicio)
  const provavel = mesProvavel(falta, r, hoje, diaInicio)
  const necessariaVal = contribuicaoNecessaria(falta, restantes)

  // O período que contém a data-alvo conta como mês de contribuição por
  // inteiro (spec 3.4, vinculante — fix de 6.4 no commit c7660c6): fora do
  // prazo é o mês provável *começar* depois da data-alvo, não terminar
  // depois dela. Início igual à data-alvo ainda está no prazo.
  let situacao: SituacaoMeta
  if (dataAlvo < hoje) {
    situacao = 'prazo_vencido'
  } else if (r === null || provavel!.inicio > dataAlvo) {
    situacao = 'fora_do_prazo'
  } else {
    situacao = 'no_prazo'
  }

  let faltariaNaData: Cents | null = null
  let mesesDeAtraso: number | null = null
  let opcoes: OpcoesPrazo | null = null

  if (situacao === 'fora_do_prazo' || situacao === 'prazo_vencido') {
    faltariaNaData = r === null ? falta : cents(Math.max(0, falta - r.valor * restantes))

    if (situacao === 'fora_do_prazo' && r !== null) {
      mesesDeAtraso = diferencaEmPeriodos(mesFinanceiro(dataAlvo, diaInicio), provavel!, diaInicio)
    }

    opcoes =
      situacao === 'prazo_vencido'
        ? {
            aumentarContribuicao: null,
            reduzirAlvo: null,
            mudarData: provavel === null ? null : provavel.fim,
          }
        : {
            aumentarContribuicao: necessariaVal,
            reduzirAlvo: r === null ? reservado : cents(reservado + r.valor * restantes),
            mudarData: r === null ? null : provavel!.fim,
          }
  }

  return {
    falta,
    percentual,
    atingida,
    mesesRestantes: restantes,
    necessaria: necessariaVal,
    ritmo: r,
    mesProvavel: provavel,
    situacao,
    faltariaNaData,
    mesesDeAtraso,
    opcoes,
  }
}

/**
 * Simula um valor mensal sem gravar nada (spec 6.5). Usa a contribuição dada
 * como se fosse o ritmo planejado; movimentos não entram na conta.
 */
export function simular(
  e: { alvo: Cents; reservado: Cents; dataAlvo: IsoDate | null; hoje: IsoDate; diaInicio: number },
  contribuicao: Cents,
): { mesProvavel: Periodo | null; mesesDeDiferenca: number | null; faltariaNaData: Cents | null } {
  const { alvo, reservado, dataAlvo, hoje, diaInicio } = e
  const { falta } = progresso(alvo, reservado)

  const ritmoSimulado: Ritmo = contribuicao > 0 ? { origem: 'planejado', valor: contribuicao } : null
  const provavel = mesProvavel(falta, ritmoSimulado, hoje, diaInicio)

  if (dataAlvo === null) {
    return { mesProvavel: provavel, mesesDeDiferenca: null, faltariaNaData: null }
  }

  const restantes = mesesRestantes(hoje, dataAlvo, diaInicio)
  const faltariaNaData = cents(Math.max(0, falta - contribuicao * restantes))
  const mesesDeDiferenca =
    contribuicao > 0 ? diferencaEmPeriodos(mesFinanceiro(dataAlvo, diaInicio), provavel!, diaInicio) : null

  return { mesProvavel: provavel, mesesDeDiferenca, faltariaNaData }
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
