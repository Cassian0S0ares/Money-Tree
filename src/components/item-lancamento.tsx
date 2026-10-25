import Link from 'next/link'
import type { Lancamento } from '../data/transactions'
import { dataCurta } from '../lib/format'
import { StatusBadge } from './status-badge'
import { Valor } from './ui'

/**
 * Uma linha de lançamento, igual na tela inicial e na lista.
 *
 * Descrição, conta e categoria vêm do usuário e são não confiáveis (§5.3).
 * Tudo entra como texto filho do JSX, que o React escapa; nada aqui pode
 * virar atributo perigoso nem HTML cru. `tests/unit/item-lancamento.test.tsx`
 * prova isso com uma carga de XSS.
 */
export function ItemLancamento({
  item,
  nomeConta,
  nomeCategoria,
  atrasado,
  mostrarData = false,
}: {
  item: Lancamento
  nomeConta: string
  nomeCategoria?: string
  atrasado: boolean
  mostrarData?: boolean
}) {
  const detalhes = [
    mostrarData ? dataCurta(item.competenceDate) : null,
    nomeConta,
    nomeCategoria,
    item.kind === 'transferencia' ? 'Transferência' : null,
    item.kind === 'ajuste' ? 'Ajuste' : null,
  ].filter(Boolean)

  return (
    <Link
      href={`/lancamentos/${item.id}`}
      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
    >
      <span className="min-w-0">
        <span className="block truncate font-medium text-slate-900">{item.description}</span>
        <span className="block truncate text-xs text-slate-600">{detalhes.join(' · ')}</span>
      </span>
      {/* No celular o selo fica embaixo do valor: estado crítico como
          "Atrasado" não pode sumir em tela pequena (§14). */}
      <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row-reverse sm:items-center sm:gap-3">
        <Valor centavos={item.amountCents} direcao={item.direction} className="font-medium" />
        <StatusBadge status={item.status} atrasado={atrasado} />
      </span>
    </Link>
  )
}
