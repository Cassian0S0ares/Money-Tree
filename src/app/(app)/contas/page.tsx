import Link from 'next/link'
import { listarContasComSaldo } from '../../../data/accounts'
import { exigirUsuario } from '../../../lib/session'
import { rotuloTipoConta } from '../../../lib/format'
import { SemDados } from '../../../components/states'
import { FormularioConfirmado } from '../../../components/formulario-confirmado'
import { CabecalhoPagina, Cartao, LinkBotao, SeloEstimado, Valor } from '../../../components/ui'
import { arquivar } from './acoes'

export const metadata = { title: 'Contas' }

export default async function PaginaContas() {
  const usuario = await exigirUsuario()
  const contas = await listarContasComSaldo(usuario.id)

  return (
    <section>
      <CabecalhoPagina
        titulo="Contas"
        descricao="Onde seu dinheiro está. Concilie com o extrato para o saldo deixar de ser estimado."
        acao={<LinkBotao href="/contas/nova">Nova conta</LinkBotao>}
      />

      {contas.length === 0 ? (
        <SemDados
          titulo="Nenhuma conta cadastrada"
          descricao="Comece pela conta onde seu salário cai. O saldo inicial é quanto há nela hoje."
          acao={<LinkBotao href="/contas/nova">Cadastrar primeira conta</LinkBotao>}
        />
      ) : (
        <Cartao>
          <ul className="divide-y divide-slate-100">
            {contas.map((conta) => (
              <li
                key={conta.id}
                className="grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-6"
              >
                <div className="min-w-0">
                  <Link
                    href={`/contas/${conta.id}`}
                    className="font-medium text-slate-900 hover:text-marca-700 hover:underline"
                  >
                    {conta.name}
                  </Link>
                  <p className="text-sm text-slate-600">
                    {rotuloTipoConta(conta.type)}
                    {conta.institution && ` · ${conta.institution}`}
                    {!conta.includeInAvailable && ' · fora do disponível'}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
                  <p className="text-lg font-semibold">
                    <Valor centavos={conta.balanceCents} />
                  </p>
                  {conta.isEstimated ? (
                    <SeloEstimado curto />
                  ) : (
                    <p className="text-xs text-marca-700">✓ Conciliada</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <LinkBotao href={`/contas/${conta.id}/conciliar`} variante="secundario">
                    Conciliar<span className="sr-only"> {conta.name}</span>
                  </LinkBotao>
                  <FormularioConfirmado
                    action={arquivar}
                    titulo={`Arquivar ${conta.name}?`}
                    descricao="A conta sai das listas e do saldo, mas o histórico de lançamentos é preservado."
                    rotuloConfirmar="Arquivar conta"
                  >
                    <input type="hidden" name="id" value={conta.id} />
                    <button
                      type="submit"
                      className="min-h-10 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    >
                      Arquivar<span className="sr-only"> {conta.name}</span>
                    </button>
                  </FormularioConfirmado>
                </div>
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </section>
  )
}
