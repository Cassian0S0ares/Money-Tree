import { diaDaSemana, diasNoMes, montarData, somarDias } from './dates'
import type { IsoDate } from './types'

/**
 * Recorrências: em que datas uma regra cai, e como descrevê-la em texto.
 * Ver a spec da fatia 2, seção 6.
 */

export type UnidadeRecorrencia = 'dia' | 'semana' | 'mes' | 'ano'
export type PoliticaFimDeSemana = 'manter' | 'proximo_dia_util'

export interface RegraDatas {
  /** Primeira ocorrência e âncora de todas as outras. */
  startDate: IsoDate
  unit: UnidadeRecorrencia
  interval: number
  /** Dia pretendido em `mes` e `ano`; nulo nas demais. */
  dayOfMonth: number | null
  endDate: IsoDate | null
  maxOccurrences: number | null
  weekendPolicy: PoliticaFimDeSemana
}

export interface Ocorrencia {
  /** Data do calendário da regra. É a identidade da ocorrência. */
  nominal: IsoDate
  /** Data de vencimento, depois do ajuste de fim de semana. */
  vencimento: IsoDate
  /** Posição na sequência desde a âncora, começando em 0. */
  indice: number
}

export class RegraInvalidaError extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'RegraInvalidaError'
  }
}

function partes(data: IsoDate): { ano: number; mes: number; dia: number } {
  const [ano, mes, dia] = data.split('-').map(Number)
  return { ano, mes: mes - 1, dia }
}

function diasEntre(de: IsoDate, ate: IsoDate): number {
  return Math.round((Date.parse(ate) - Date.parse(de)) / 86_400_000)
}

export function validarRegra(regra: RegraDatas): void {
  const { startDate, unit, interval, dayOfMonth, endDate, maxOccurrences } = regra

  if (!Number.isInteger(interval) || interval < 1 || interval > 366) {
    throw new RegraInvalidaError('O intervalo precisa ser um número inteiro entre 1 e 366')
  }

  const mensal = unit === 'mes' || unit === 'ano'
  if (!mensal && dayOfMonth !== null) {
    throw new RegraInvalidaError('Dia do mês só existe em recorrência mensal ou anual')
  }
  if (mensal) {
    if (dayOfMonth === null || !Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      throw new RegraInvalidaError('O dia do mês precisa estar entre 1 e 31')
    }
    // O dia pedido é o do início, ou maior quando o início é o último dia
    // de um mês curto: começar em 28/fev pedindo "todo dia 31".
    const inicio = partes(startDate)
    const ultimo = diasNoMes(inicio.ano, inicio.mes)
    const coerente = dayOfMonth === inicio.dia || (inicio.dia === ultimo && dayOfMonth > ultimo)
    if (!coerente) {
      throw new RegraInvalidaError('O dia do mês precisa ser o dia da primeira ocorrência')
    }
  }

  if (endDate !== null && maxOccurrences !== null) {
    throw new RegraInvalidaError('Escolha um fim só: até uma data ou um número de vezes')
  }
  if (endDate !== null && endDate < startDate) {
    throw new RegraInvalidaError('A data final não pode ser antes da primeira ocorrência')
  }
  if (maxOccurrences !== null && (!Number.isInteger(maxOccurrences) || maxOccurrences < 1)) {
    throw new RegraInvalidaError('O número de vezes precisa ser pelo menos 1')
  }
}

/**
 * Data nominal da ocorrência `k`. Sempre a partir da âncora, nunca da
 * ocorrência anterior: somar um mês ao resultado anterior faria o dia 31
 * virar 28 em fevereiro e ficar no 28 para sempre.
 */
function nominalDo(regra: RegraDatas, k: number): IsoDate {
  const passos = k * regra.interval

  switch (regra.unit) {
    case 'dia':
      return somarDias(regra.startDate, passos)
    case 'semana':
      return somarDias(regra.startDate, passos * 7)
    case 'mes':
    case 'ano': {
      const inicio = partes(regra.startDate)
      const meses = inicio.ano * 12 + inicio.mes + (regra.unit === 'mes' ? passos : passos * 12)
      const ano = Math.floor(meses / 12)
      const mes = meses % 12
      return montarData(ano, mes, Math.min(regra.dayOfMonth!, diasNoMes(ano, mes)))
    }
  }
}

/**
 * Um `k` a partir do qual vale começar a procurar: nenhuma ocorrência
 * anterior a ele cai em `de` ou depois. Evita percorrer anos de série para
 * achar a janela pedida.
 */
function primeiroCandidato(regra: RegraDatas, de: IsoDate): number {
  if (de <= regra.startDate) return 0

  switch (regra.unit) {
    case 'dia':
      return Math.floor(diasEntre(regra.startDate, de) / regra.interval)
    case 'semana':
      return Math.floor(diasEntre(regra.startDate, de) / (7 * regra.interval))
    case 'mes':
    case 'ano': {
      const inicio = partes(regra.startDate)
      const alvo = partes(de)
      const meses = (alvo.ano - inicio.ano) * 12 + (alvo.mes - inicio.mes)
      const porPasso = regra.unit === 'mes' ? regra.interval : regra.interval * 12
      return Math.max(0, Math.floor(meses / porPasso) - 1)
    }
  }
}

function vencimentoDe(nominal: IsoDate, politica: PoliticaFimDeSemana): IsoDate {
  if (politica === 'manter') return nominal
  const dia = diaDaSemana(nominal)
  if (dia === 6) return somarDias(nominal, 2)
  if (dia === 0) return somarDias(nominal, 1)
  return nominal
}

/** Ocorrências cuja data nominal está em `[de, ate]`, em ordem. */
export function ocorrencias(regra: RegraDatas, de: IsoDate, ate: IsoDate): Ocorrencia[] {
  const lista: Ocorrencia[] = []

  for (let k = primeiroCandidato(regra, de); ; k++) {
    if (regra.maxOccurrences !== null && k >= regra.maxOccurrences) break

    const nominal = nominalDo(regra, k)
    if (nominal > ate) break
    if (regra.endDate !== null && nominal > regra.endDate) break

    if (nominal >= de) {
      lista.push({ nominal, vencimento: vencimentoDe(nominal, regra.weekendPolicy), indice: k })
    }
  }

  return lista
}

const DIAS_SEMANA = [
  { singular: 'Todo domingo', plural: 'aos domingos' },
  { singular: 'Toda segunda-feira', plural: 'às segundas-feiras' },
  { singular: 'Toda terça-feira', plural: 'às terças-feiras' },
  { singular: 'Toda quarta-feira', plural: 'às quartas-feiras' },
  { singular: 'Toda quinta-feira', plural: 'às quintas-feiras' },
  { singular: 'Toda sexta-feira', plural: 'às sextas-feiras' },
  { singular: 'Todo sábado', plural: 'aos sábados' },
]

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/** A frequência em português, como a pessoa diria. */
export function descreverRegra(regra: RegraDatas): string {
  const { unit, interval, dayOfMonth, startDate } = regra
  let texto: string

  switch (unit) {
    case 'dia':
      texto = interval === 1 ? 'Todo dia' : `A cada ${interval} dias`
      break
    case 'semana': {
      const dia = DIAS_SEMANA[diaDaSemana(startDate)]
      texto = interval === 1 ? dia.singular : `A cada ${interval} semanas, ${dia.plural}`
      break
    }
    case 'mes': {
      const sufixo = dayOfMonth! >= 29 ? ' (ou o último dia do mês)' : ''
      texto =
        interval === 1
          ? `Todo dia ${dayOfMonth}${sufixo}`
          : `A cada ${interval} meses, no dia ${dayOfMonth}${sufixo}`
      break
    }
    case 'ano': {
      const { mes } = partes(startDate)
      const data = `${dayOfMonth} de ${MESES[mes]}`
      const sufixo =
        mes === 1 && dayOfMonth === 29
          ? ' (ou 28 nos anos não bissextos)'
          : dayOfMonth! > diasNoMes(2001, mes)
            ? ' (ou o último dia do mês)'
            : ''
      texto = interval === 1 ? `Todo ano em ${data}${sufixo}` : `A cada ${interval} anos, em ${data}${sufixo}`
      break
    }
  }

  if (regra.maxOccurrences !== null) {
    texto += `, ${regra.maxOccurrences} ${regra.maxOccurrences === 1 ? 'vez' : 'vezes'}`
  } else if (regra.endDate !== null) {
    const { ano, mes, dia } = partes(regra.endDate)
    texto += `, até ${String(dia).padStart(2, '0')}/${String(mes + 1).padStart(2, '0')}/${ano}`
  }

  return texto
}
