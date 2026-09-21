import { comparaDatas } from './dates'
import type {
  Cents,
  IsoDate,
  TransactionKind,
  TransactionNature,
  TransactionStatus,
} from './types'

export class LancamentoInvalidoError extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'LancamentoInvalidoError'
  }
}

/**
 * Um lançamento pode nascer já liquidado. Registrar a despesa que acabou de
 * ser paga é o caso mais comum; obrigá-la a passar por `previsto` seria
 * cerimônia inútil.
 */
export const STATUS_INICIAIS = [
  'previsto',
  'pendente',
  'liquidado',
] as const satisfies readonly TransactionStatus[]

/** Só estes dois movem o saldo. Ver PRODUCT.md §6.1. */
export const MOVEM_SALDO = [
  'liquidado',
  'conciliado',
] as const satisfies readonly TransactionStatus[]

const TRANSICOES: Record<TransactionStatus, readonly TransactionStatus[]> = {
  previsto: ['pendente', 'liquidado', 'cancelado'],
  pendente: ['liquidado', 'cancelado'],
  liquidado: ['conciliado', 'estornado'],
  conciliado: ['estornado'],
  cancelado: [],
  estornado: [],
}

export function podeTransicionar(de: TransactionStatus, para: TransactionStatus): boolean {
  return TRANSICOES[de].includes(para)
}

export function assertTransicao(de: TransactionStatus, para: TransactionStatus): void {
  if (!podeTransicionar(de, para)) {
    throw new LancamentoInvalidoError(`Transição proibida: ${de} -> ${para}`)
  }
}

/**
 * Receita sempre entra, despesa sempre sai. Transferência e ajuste podem ir
 * para qualquer lado, então exigem direção explícita de quem chama.
 */
export function direcaoPara(kind: TransactionKind, explicita?: -1 | 1): -1 | 1 {
  const fixa: Partial<Record<TransactionKind, -1 | 1>> = { receita: 1, despesa: -1 }
  const esperada = fixa[kind]

  if (esperada !== undefined) {
    if (explicita !== undefined && explicita !== esperada) {
      throw new LancamentoInvalidoError(
        `Tipo "${kind}" exige direção ${esperada}, recebido ${explicita}`,
      )
    }
    return esperada
  }

  if (explicita === undefined) {
    throw new LancamentoInvalidoError(`Tipo "${kind}" exige direção explícita`)
  }
  return explicita
}

export interface LancamentoValidavel {
  kind: TransactionKind
  amountCents: Cents
  direction: -1 | 1
  status: TransactionStatus
  competenceDate: IsoDate
  settledDate: IsoDate | null
  nature: TransactionNature | null
  categoryId: string | null
  transferGroupId: string | null
  adjustmentReason: string | null
}

const MOVEM_SALDO_SET: ReadonlySet<TransactionStatus> = new Set(MOVEM_SALDO)

/**
 * As mesmas invariantes existem como CHECK no banco. Aqui elas falham cedo,
 * com mensagem legível; lá elas falham sempre, mesmo se este código mudar.
 */
export function validarLancamento(lancamento: LancamentoValidavel): void {
  const { kind, amountCents, direction, status, settledDate, nature } = lancamento

  if (amountCents <= 0) {
    throw new LancamentoInvalidoError(
      'Valor precisa ser positivo; o efeito contábil vem da direção, não do sinal',
    )
  }

  direcaoPara(kind, direction)

  const movimentaSaldo = MOVEM_SALDO_SET.has(status)
  if (movimentaSaldo && settledDate === null) {
    throw new LancamentoInvalidoError(`Status "${status}" exige data de liquidação`)
  }
  if (!movimentaSaldo && settledDate !== null) {
    throw new LancamentoInvalidoError(`Status "${status}" não pode ter data de liquidação`)
  }

  const aceitaNatureza = kind === 'receita' || kind === 'despesa'
  if (aceitaNatureza && nature === null) {
    throw new LancamentoInvalidoError(`Tipo "${kind}" exige natureza fixa ou variável`)
  }
  if (!aceitaNatureza && nature !== null) {
    throw new LancamentoInvalidoError(`Tipo "${kind}" não aceita natureza`)
  }

  if (kind === 'transferencia') {
    if (lancamento.transferGroupId === null) {
      throw new LancamentoInvalidoError('Transferência exige grupo que ligue os dois lados')
    }
    if (lancamento.categoryId !== null) {
      throw new LancamentoInvalidoError(
        'Transferência não é receita nem despesa, não leva categoria',
      )
    }
  }

  if (kind === 'ajuste' && !lancamento.adjustmentReason?.trim()) {
    throw new LancamentoInvalidoError('Ajuste de saldo exige motivo registrado')
  }
}

/**
 * `atrasado` é derivado, nunca gravado. Estado gravado precisaria de um
 * processo periódico para virá-lo, e um processo que falha deixa o dado
 * mentindo. Ver a spec, seção 5.5.
 */
export function estaAtrasado(
  lancamento: { competenceDate: IsoDate; status: TransactionStatus },
  hoje: IsoDate,
): boolean {
  const aguardando = lancamento.status === 'previsto' || lancamento.status === 'pendente'
  return aguardando && comparaDatas(lancamento.competenceDate, hoje) < 0
}
