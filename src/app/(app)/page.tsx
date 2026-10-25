import Link from 'next/link'
import { listarContasComSaldo } from '../../data/accounts'
import { somarSaldos } from '../../domain/balance'
import { exigirUsuario } from '../../lib/session'
import { dinheiro } from '../../lib/format'
import { SemDados } from '../../components/states'

export default async function PaginaSaldos() {
  const usuario = await exigirUsuario()
  const contas = await listarContasComSaldo(usuario.id)

  if (contas.length === 0) {
    return (
      <SemDados
        titulo="Vamos começar pelas suas contas"
        descricao="Cadastre onde seu dinheiro está hoje. Os saldos aparecem aqui assim que houver uma conta."
        acao={
          <Link href="/contas/nova" className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">
            Cadastrar conta
          </Link>
        }
      />
    )
  }

  const disponiveis = contas.filter((conta) => conta.includeInAvailable && conta.isLiquid)
  const total = somarSaldos(disponiveis)
  const patrimonio = somarSaldos(contas.filter((conta) => conta.includeInNetWorth))

  return (
    <section className="space-y-8">
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="text-sm font-medium text-slate-600">Saldo disponível</h1>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{dinheiro(total.balanceCents)}</p>
        <p className="mt-2 text-sm text-slate-600">
          {total.isEstimated
            ? 'Estimado: pelo menos uma conta ainda não foi conciliada com o extrato.'
            : 'Conferido com o extrato de todas as contas incluídas.'}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Soma das contas líquidas marcadas como disponíveis. Cartão de crédito e investimento
          sem liquidez não entram.
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-slate-600">Por conta</h2>
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {contas.map((conta) => (
            <li key={conta.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{conta.name}</p>
                {!conta.includeInAvailable && (
                  <p className="text-xs text-slate-500">Fora do disponível</p>
                )}
              </div>
              <p className="tabular-nums">
                {dinheiro(conta.balanceCents)}
                {conta.isEstimated && <span className="ml-1 text-xs text-slate-500">≈</span>}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-sm text-slate-600">
        Patrimônio líquido: <span className="tabular-nums">{dinheiro(patrimonio.balanceCents)}</span>
      </p>
    </section>
  )
}
