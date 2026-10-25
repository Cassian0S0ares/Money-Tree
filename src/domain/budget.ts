import { mesFinanceiro, somarDias } from './dates'
import type { Cents, IsoDate } from './types'

/**
 * Orçamento por categoria e mês financeiro (spec da fatia 3).
 *
 * Tudo aqui é cálculo puro sobre o que o repositório entrega: limites
 * datados, gasto realizado por período e o dia de hoje.
 */

export interface Periodo {
  inicio: IsoDate
  fim: IsoDate
}

export interface Limite {
  /** O limite vale a partir do período que começa nesta data. */
  startsOn: IsoDate
  amountCents: Cents
}

const DIA = 86_400_000

export function diasDoPeriodo(periodo: Periodo): number {
  return Math.round((Date.parse(periodo.fim) - Date.parse(periodo.inicio)) / DIA) + 1
}

export function periodoAnterior(periodo: Periodo, diaInicio: number): Periodo {
  return mesFinanceiro(somarDias(periodo.inicio, -1), diaInicio)
}

export function proximoPeriodo(periodo: Periodo, diaInicio: number): Periodo {
  return mesFinanceiro(somarDias(periodo.fim, 1), diaInicio)
}

/** Os períodos que tocam `[de, ate]`, em ordem. */
export function periodosEntre(de: IsoDate, ate: IsoDate, diaInicio: number): Periodo[] {
  const lista: Periodo[] = []
  for (let periodo = mesFinanceiro(de, diaInicio); periodo.inicio <= ate; periodo = proximoPeriodo(periodo, diaInicio)) {
    lista.push(periodo)
  }
  return lista
}

/**
 * O limite em vigor num período: o de maior `startsOn` que já começou.
 * Compara com o início do período, e não exige que `startsOn` seja um
 * início de período: se a pessoa muda o dia de início do mês, os limites
 * antigos continuam valendo do mesmo jeito.
 */
export function limiteVigente(limites: Limite[], inicio: IsoDate): Cents | null {
  let vigente: Limite | null = null
  for (const limite of limites) {
    if (limite.startsOn <= inicio && (vigente === null || limite.startsOn > vigente.startsOn)) {
      vigente = limite
    }
  }
  return vigente?.amountCents ?? null
}

/**
 * Disponível de cada período: o limite, mais a sobra do período anterior
 * quando a acumulação está ligada (spec 6.2).
 *
 * Só a sobra passa adiante. Estouro não vira dívida no mês seguinte:
 * carregar o negativo empurraria a pessoa para meses impossíveis. A cadeia
 * começa em `rolloverSince`; antes disso, ou sem acumulação, o disponível é
 * o limite. Período em que o orçamento ainda não existia fica nulo.
 */
export function disponiveis(entrada: {
  periodos: Periodo[]
  limites: Limite[]
  rolloverSince: IsoDate | null
  /** Realizado por período, indexado pelo início. Ausente vale zero. */
  realizado: Map<string, Cents>
}): Map<string, Cents | null> {
  const resultado = new Map<string, Cents | null>()
  let anterior: { periodo: Periodo; disponivel: Cents | null } | null = null

  for (const periodo of entrada.periodos) {
    const limite = limiteVigente(entrada.limites, periodo.inicio)
    let disponivel: Cents | null = limite

    const acumula =
      limite !== null &&
      entrada.rolloverSince !== null &&
      anterior !== null &&
      anterior.disponivel !== null &&
      anterior.periodo.inicio >= entrada.rolloverSince

    if (acumula) {
      const gasto = entrada.realizado.get(anterior!.periodo.inicio) ?? 0
      disponivel = (limite! + Math.max(0, anterior!.disponivel! - gasto)) as Cents
    }

    resultado.set(periodo.inicio, disponivel)
    anterior = { periodo, disponivel }
  }

  return resultado
}
