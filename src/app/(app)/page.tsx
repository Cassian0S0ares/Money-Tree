import Link from 'next/link'
import { listarContasComSaldo } from '../../data/accounts'
import { listarLancamentos } from '../../data/transactions'
import { proximasContas } from '../../data/recurrences'
import { listarMetas } from '../../data/goals'
import { ProximasContas } from '../../components/proximas-contas'
import { OrcamentoResumo } from '../../components/orcamento-resumo'
import { MetasResumo } from '../../components/metas-resumo'
import { resumoOrcamento } from '../../data/budgets'
import { mesFinanceiro } from '../../domain/dates'
import { somarSaldos } from '../../domain/balance'
import { hojeEm } from '../../domain/dates'
import { estaAtrasado } from '../../domain/transaction'
import { exigirUsuario } from '../../lib/session'
import { rotuloTipoConta } from '../../lib/format'
import { SemDados } from '../../components/states'
import { ItemLancamento } from '../../components/item-lancamento'
import { Cartao, LinkBotao, SeloEstimado, Valor } from '../../components/ui'

export const metadata = { title: 'Saldos' }

const DIAS_PROXIMAS = 30

export default async function PaginaSaldos() {
  const usuario = await exigirUsuario()
  const hoje = hojeEm(usuario.timezone)
  const [contas, recentes, proximas, metas] = await Promise.all([
    listarContasComSaldo(usuario.id),
    // "Últimos" é até hoje: sem o corte, as ocorrências previstas dos
    // próximos meses tomariam a lista.
    listarLancamentos(usuario.id, { limite: 5, ate: hoje }),
    proximasContas(usuario.id, hoje, DIAS_PROXIMAS),
    listarMetas(usuario.id, hoje, usuario.monthStartDay),
  ])
  const orcamento = await resumoOrcamento(usuario.id, mesFinanceiro(hoje, usuario.monthStartDay), hoje, usuario.monthStartDay)

  if (contas.length === 0) {
    return (
      <SemDados
        titulo="Vamos começar pelas suas contas"
        descricao="Cadastre onde seu dinheiro está hoje. Os saldos aparecem aqui assim que houver uma conta."
        acao={<LinkBotao href="/contas/nova">Cadastrar conta</LinkBotao>}
      />
    )
  }

  const disponiveis = contas.filter((conta) => conta.includeInAvailable && conta.isLiquid)
  const total = somarSaldos(disponiveis)
  const patrimonio = somarSaldos(contas.filter((conta) => conta.includeInNetWorth))
  const nomeConta = new Map(contas.map((conta) => [conta.id, conta.name]))

  return (
    <div className="space-y-8">
      <section aria-labelledby="titulo-disponivel">
        <Cartao className="overflow-hidden">
          <div className="bg-gradient-to-br from-marca-700 to-marca-900 px-6 py-7 text-white">
            <h1 id="titulo-disponivel" className="text-sm font-medium text-marca-100">
              Saldo disponível
            </h1>
            <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
              <Valor centavos={total.balanceCents} />
            </p>
            <p className="mt-3 flex items-center gap-2 text-sm text-marca-50">
              <span aria-hidden="true">{total.isEstimated ? '≈' : '✓'}</span>
              {total.isEstimated
                ? 'Estimado: pelo menos uma conta incluída ainda não foi conciliada com o extrato.'
                : 'Conferido com o extrato de todas as contas incluídas.'}
            </p>
          </div>
          <dl className="grid divide-y divide-slate-200 text-sm sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <div className="px-6 py-4">
              <dt className="text-slate-600">Patrimônio líquido</dt>
              <dd className="mt-0.5 text-lg font-semibold text-slate-900">
                <Valor centavos={patrimonio.balanceCents} />
              </dd>
            </div>
            <div className="px-6 py-4">
              <dt className="text-slate-600">O que entra no disponível</dt>
              <dd className="mt-0.5 text-slate-700">
                Contas líquidas marcadas como disponíveis. Cartão de crédito e investimento sem
                liquidez ficam de fora.
              </dd>
            </div>
          </dl>
        </Cartao>
      </section>

      <ProximasContas
        itens={proximas.itens}
        aPagar={proximas.aPagar}
        aReceber={proximas.aReceber}
        dias={DIAS_PROXIMAS}
        nomeConta={nomeConta}
      />

      <OrcamentoResumo itens={orcamento.itens} />

      <MetasResumo ativas={metas.ativas} />

      <section aria-labelledby="titulo-contas">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="titulo-contas" className="text-lg font-semibold text-slate-900">
            Contas
          </h2>
          <Link href="/contas" className="text-sm font-medium text-marca-700 hover:underline">
            Gerenciar contas
          </Link>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {contas.map((conta) => (
            <li key={conta.id}>
              <Cartao className="flex h-full flex-col justify-between gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{conta.name}</p>
                    <p className="text-xs text-slate-600">
                      {rotuloTipoConta(conta.type)}
                      {!conta.includeInAvailable && ' · fora do disponível'}
                    </p>
                  </div>
                  <p className="text-right text-lg font-semibold">
                    <Valor centavos={conta.balanceCents} />
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2 text-sm">
                  {conta.isEstimated ? <SeloEstimado /> : <span className="text-marca-700">✓ Conciliada</span>}
                  {conta.isEstimated && (
                    <Link
                      href={`/contas/${conta.id}/conciliar`}
                      className="font-medium text-marca-700 hover:underline"
                    >
                      Conciliar<span className="sr-only"> {conta.name}</span>
                    </Link>
                  )}
                </div>
              </Cartao>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="titulo-recentes">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="titulo-recentes" className="text-lg font-semibold text-slate-900">
            Últimos lançamentos
          </h2>
          <Link href="/lancamentos" className="text-sm font-medium text-marca-700 hover:underline">
            Ver todos
          </Link>
        </div>
        {recentes.itens.length === 0 ? (
          <Cartao className="p-6 text-center text-sm text-slate-600">
            Nenhum lançamento ainda.{' '}
            <Link href="/lancamentos/novo" className="font-medium text-marca-700 hover:underline">
              Registrar o primeiro
            </Link>
          </Cartao>
        ) : (
          <Cartao>
            <ul className="divide-y divide-slate-100">
              {recentes.itens.map((item) => (
                <li key={item.id}>
                  <ItemLancamento
                    item={item}
                    nomeConta={nomeConta.get(item.accountId) ?? 'Conta'}
                    atrasado={estaAtrasado(item, hoje)}
                    mostrarData
                  />
                </li>
              ))}
            </ul>
          </Cartao>
        )}
      </section>
    </div>
  )
}
