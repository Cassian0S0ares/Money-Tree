import { cents, sumCents } from './money'
import { MOVEM_SALDO } from './transaction'
import type { Cents, TransactionStatus } from './types'

export interface LinhaRazao {
  signedAmountCents: Cents
  status: TransactionStatus
  /** Quando a linha foi liquidada. Nulo enquanto não move saldo. */
  settledAt: Date | null
}

export interface EntradaSaldo {
  initialBalanceCents: Cents
  linhas: LinhaRazao[]
  lastReconciledAt: Date | null
}

export interface ResultadoSaldo {
  balanceCents: Cents
  isEstimated: boolean
}

const CONTAM: ReadonlySet<TransactionStatus> = new Set(MOVEM_SALDO)

/**
 * Saldo calculado = saldo inicial + soma dos lançamentos que movem saldo.
 *
 * `isEstimated` responde à exigência do §6.1: saldo que ainda não foi
 * conferido com uma fonte externa precisa se anunciar como estimativa. É
 * verdadeiro quando a conta nunca foi conciliada, ou quando houve movimento
 * depois da última conciliação.
 */
export function calcularSaldo(entrada: EntradaSaldo): ResultadoSaldo {
  const contadas = entrada.linhas.filter((linha) => CONTAM.has(linha.status))

  const balanceCents = cents(
    entrada.initialBalanceCents + sumCents(contadas.map((linha) => linha.signedAmountCents)),
  )

  const conciliadaAlgumaVez = entrada.lastReconciledAt !== null
  const houveMovimentoDepois =
    conciliadaAlgumaVez &&
    contadas.some(
      (linha) => linha.settledAt !== null && linha.settledAt > entrada.lastReconciledAt!,
    )

  return {
    balanceCents,
    isEstimated: !conciliadaAlgumaVez || houveMovimentoDepois,
  }
}

/**
 * Total da tela inicial. Uma única conta estimada torna o total estimado:
 * apresentar um total como confirmado quando uma das parcelas não é seria
 * exatamente a dupla contagem disfarçada que o §6.2 proíbe.
 */
export function somarSaldos(resultados: ResultadoSaldo[]): ResultadoSaldo {
  return {
    balanceCents: sumCents(resultados.map((resultado) => resultado.balanceCents)),
    isEstimated: resultados.some((resultado) => resultado.isEstimated),
  }
}
