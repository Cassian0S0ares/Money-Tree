import Link from 'next/link'
import { listarContasComSaldo } from '../../../data/accounts'
import { exigirUsuario } from '../../../lib/session'
import { dinheiro } from '../../../lib/format'
import { SemDados } from '../../../components/states'
import { arquivar } from './acoes'

export default async function PaginaContas() {
  const usuario = await exigirUsuario()
  const contas = await listarContasComSaldo(usuario.id)

  return (
    <section>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Contas</h1>
        <Link href="/contas/nova" className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">
          Nova conta
        </Link>
      </div>

      {contas.length === 0 ? (
        <SemDados
          titulo="Nenhuma conta cadastrada"
          descricao="Comece pela conta onde seu salário cai. O saldo inicial é quanto há nela hoje."
          acao={
            <Link href="/contas/nova" className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">
              Cadastrar primeira conta
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {contas.map((conta) => (
            <li key={conta.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <Link href={`/contas/${conta.id}`} className="font-medium hover:underline">
                  {conta.name}
                </Link>
                <p className="text-sm text-slate-600">
                  {conta.institution ?? 'Sem instituição'}
                  {!conta.includeInAvailable && ' · fora do disponível'}
                </p>
              </div>

              <div className="text-right">
                <p className="font-medium tabular-nums">{dinheiro(conta.balanceCents)}</p>
                {conta.isEstimated && (
                  <p className="text-xs text-slate-500">
                    <span aria-hidden="true">≈ </span>Estimado, ainda não conciliado
                  </p>
                )}
              </div>

              <div className="flex gap-3 text-sm">
                <Link href={`/contas/${conta.id}/conciliar`} className="underline">
                  Conciliar
                </Link>
                <form action={arquivar}>
                  <input type="hidden" name="id" value={conta.id} />
                  <button type="submit" className="underline">Arquivar</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
