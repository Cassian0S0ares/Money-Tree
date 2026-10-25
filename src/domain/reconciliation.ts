import { cents, subCents } from './money'
import type { Cents } from './types'

export type DecisaoConciliacao =
  | 'lancamento_localizado'
  | 'duplicidade_removida'
  | 'ajuste_criado'
  | 'adiado'

export interface ResultadoConciliacao {
  /** Informado menos calculado. Positivo: falta entrada no razão. */
  differenceCents: Cents
  confere: boolean
  decisoesPossiveis: DecisaoConciliacao[]
}

/**
 * Ordem deliberada: investigar antes de ajustar. Criar um ajuste é a saída
 * quando a busca não resolve, não o primeiro impulso — o §5.3.1 exige que o
 * ajuste registre valor, data, motivo e origem, e que nunca reescreva
 * lançamento anterior em silêncio.
 */
const DECISOES: DecisaoConciliacao[] = [
  'lancamento_localizado',
  'duplicidade_removida',
  'ajuste_criado',
  'adiado',
]

export function conciliar(reportedCents: Cents, calculatedCents: Cents): ResultadoConciliacao {
  const differenceCents = subCents(reportedCents, calculatedCents)
  const confere = differenceCents === cents(0)

  return {
    differenceCents,
    confere,
    decisoesPossiveis: confere ? [] : [...DECISOES],
  }
}
