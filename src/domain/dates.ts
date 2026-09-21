import type { IsoDate } from './types'

export class DataInvalidaError extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'DataInvalidaError'
  }
}

const PADRAO = /^(\d{4})-(\d{2})-(\d{2})$/

/** Valida AAAA-MM-DD e confirma que a data existe de verdade. */
export function isoDate(texto: string): IsoDate {
  const casou = PADRAO.exec(texto)
  if (!casou) {
    throw new DataInvalidaError(`Data precisa estar em AAAA-MM-DD, recebido: "${texto}"`)
  }

  const [, ano, mes, dia] = casou
  const data = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)))

  const existe =
    data.getUTCFullYear() === Number(ano) &&
    data.getUTCMonth() === Number(mes) - 1 &&
    data.getUTCDate() === Number(dia)

  if (!existe) {
    throw new DataInvalidaError(`Data inexistente: "${texto}"`)
  }

  return texto as IsoDate
}

/**
 * A data civil de hoje no fuso do usuário. O servidor pode estar em qualquer
 * lugar; a data financeira é a que o usuário vê no calendário dele.
 */
export function hojeEm(timezone: string, agora: Date = new Date()): IsoDate {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora)

  return isoDate(partes)
}

/** Ordem cronológica. AAAA-MM-DD ordena corretamente como texto. */
export function comparaDatas(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function paraUTC(data: IsoDate): Date {
  const [ano, mes, dia] = data.split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1, dia))
}

function paraIso(data: Date): IsoDate {
  return isoDate(data.toISOString().slice(0, 10))
}

function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate()
}

/** Início do período que contém `referencia`, dado o dia de virada. */
function inicioDoPeriodo(ano: number, mes: number, diaInicio: number): Date {
  const dia = Math.min(diaInicio, ultimoDiaDoMes(ano, mes))
  return new Date(Date.UTC(ano, mes, dia))
}

/**
 * O mês financeiro do usuário, que não precisa começar no dia 1.
 * Com diaInicio = 5, o período de setembro vai de 05/09 a 04/10.
 * Se o mês não tiver o dia de início — dia 31 em fevereiro — usa o último dia.
 */
export function mesFinanceiro(
  referencia: IsoDate,
  diaInicio: number,
): { inicio: IsoDate; fim: IsoDate } {
  if (!Number.isInteger(diaInicio) || diaInicio < 1 || diaInicio > 31) {
    throw new DataInvalidaError(`Dia de início precisa estar entre 1 e 31, recebido: ${diaInicio}`)
  }

  const ref = paraUTC(referencia)
  const ano = ref.getUTCFullYear()
  const mes = ref.getUTCMonth()

  let inicio = inicioDoPeriodo(ano, mes, diaInicio)
  if (ref < inicio) {
    inicio = inicioDoPeriodo(ano, mes - 1, diaInicio)
  }

  const proximo = inicioDoPeriodo(
    inicio.getUTCFullYear(),
    inicio.getUTCMonth() + 1,
    diaInicio,
  )
  const fim = new Date(proximo.getTime() - 86_400_000)

  return { inicio: paraIso(inicio), fim: paraIso(fim) }
}
