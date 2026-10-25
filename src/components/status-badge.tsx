import { rotuloStatus } from '../lib/format'
import type { TransactionStatus } from '../domain/types'

const CORES: Record<string, string> = {
  Atrasado: 'bg-red-50 text-red-900 border-red-200',
  Previsto: 'bg-slate-50 text-slate-700 border-slate-200',
  Pendente: 'bg-amber-50 text-amber-900 border-amber-200',
  Liquidado: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  Conciliado: 'bg-emerald-100 text-emerald-950 border-emerald-300',
  Cancelado: 'bg-slate-100 text-slate-600 border-slate-300',
  Estornado: 'bg-slate-100 text-slate-600 border-slate-300',
}

export function StatusBadge({
  status,
  atrasado = false,
}: {
  status: TransactionStatus
  atrasado?: boolean
}) {
  const { texto, icone } = rotuloStatus(status, atrasado)

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${CORES[texto]}`}
    >
      {/* O ícone é decorativo; o texto ao lado é o que comunica. */}
      <span aria-hidden="true">{icone}</span>
      {texto}
    </span>
  )
}
