/** Centavos inteiros. Nunca ponto flutuante. Ver PRODUCT.md §12. */
export type Cents = number & { readonly __cents: unique symbol }

/** Data civil no formato AAAA-MM-DD. */
export type IsoDate = string & { readonly __isoDate: unique symbol }

export type TransactionKind = 'receita' | 'despesa' | 'transferencia' | 'ajuste'

/**
 * Os seis estados gravados. `atrasado` não está aqui de propósito:
 * é derivado de vencimento e liquidação. Ver a spec, seção 5.5.
 */
export type TransactionStatus =
  | 'previsto'
  | 'pendente'
  | 'liquidado'
  | 'conciliado'
  | 'cancelado'
  | 'estornado'

export type TransactionNature = 'fixa' | 'variavel'

export type TransactionSource = 'manual' | 'importacao' | 'integracao' | 'ia'

export type AccountType =
  | 'corrente'
  | 'pagamento'
  | 'poupanca'
  | 'carteira'
  | 'cartao_credito'
  | 'investimento'
  | 'emprestimo'
  | 'outro'

export type CategoryKind = 'receita' | 'despesa'
