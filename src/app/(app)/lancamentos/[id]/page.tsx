import { notFound } from 'next/navigation'
import { buscarConta } from '../../../../data/accounts'
import { buscarLancamento } from '../../../../data/transactions'
import { hojeEm } from '../../../../domain/dates'
import { estaAtrasado } from '../../../../domain/transaction'
import { exigirUsuario } from '../../../../lib/session'
import { dataLonga, dinheiro } from '../../../../lib/format'
import { StatusBadge } from '../../../../components/status-badge'
import { estornar, marcarLiquidado } from '../acoes'

export default async function PaginaLancamento({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const usuario = await exigirUsuario()
  const lancamento = await buscarLancamento(usuario.id, id)
  if (!lancamento) notFound()

  const conta = await buscarConta(usuario.id, lancamento.accountId)
  const hoje = hojeEm(usuario.timezone)
  const podeLiquidar = lancamento.status === 'previsto' || lancamento.status === 'pendente'
  const podeEstornar = lancamento.status === 'liquidado' || lancamento.status === 'conciliado'

  return (
    <section className="max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{lancamento.description}</h1>
        <div className="mt-2 flex items-center gap-3">
          <StatusBadge status={lancamento.status} atrasado={estaAtrasado(lancamento, hoje)} />
          <span className="tabular-nums">
            {lancamento.direction === 1 ? '+' : '−'} {dinheiro(lancamento.amountCents)}
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-y-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <dt className="text-slate-600">Conta</dt>
        <dd>{conta?.name ?? '—'}</dd>

        <dt className="text-slate-600">Competência</dt>
        <dd>{dataLonga(lancamento.competenceDate)}</dd>

        <dt className="text-slate-600">Liquidação</dt>
        <dd>{lancamento.settledDate ? dataLonga(lancamento.settledDate) : 'Ainda não liquidado'}</dd>

        {lancamento.adjustmentReason && (
          <>
            <dt className="text-slate-600">Motivo do ajuste</dt>
            <dd>{lancamento.adjustmentReason}</dd>
          </>
        )}
      </dl>

      {podeLiquidar && (
        <form action={marcarLiquidado} className="flex items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <input type="hidden" name="id" value={lancamento.id} />
          <div>
            <label htmlFor="quando" className="block text-sm font-medium">Liquidado em</label>
            <input
              id="quando" name="quando" type="date" required defaultValue={hoje}
              className="mt-1 rounded border border-slate-300 px-3 py-2"
            />
          </div>
          <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            Marcar como liquidado
          </button>
        </form>
      )}

      {podeEstornar && (
        <form action={estornar} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <input type="hidden" name="id" value={lancamento.id} />
          <p className="text-sm text-slate-700">
            Lançamento liquidado não é apagado. Corrigir gera um estorno, e os dois registros
            continuam visíveis no histórico.
            {lancamento.transferGroupId &&
              ' Por ser transferência, os dois lados são estornados juntos.'}
          </p>
          <div>
            <label htmlFor="motivo" className="block text-sm font-medium">Motivo do estorno</label>
            <input
              id="motivo" name="motivo" required
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </div>
          <button type="submit" className="rounded bg-red-700 px-4 py-2 text-sm font-medium text-white">
            Estornar lançamento
          </button>
        </form>
      )}
    </section>
  )
}
