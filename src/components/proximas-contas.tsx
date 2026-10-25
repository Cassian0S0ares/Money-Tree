import Link from 'next/link'
import type { ContaProxima } from '../data/recurrences'
import type { Cents } from '../domain/types'
import { dataLonga } from '../lib/format'
import { StatusBadge } from './status-badge'
import { Cartao, Valor } from './ui'

/**
 * Atrasadas e próximos vencimentos (spec da fatia 2, seção 8). As somas
 * separam pagar e receber e deixam transferência de fora. Não há conta de
 * dinheiro livre aqui: ela é da fatia 5, e uma soma aproximada agora seria
 * número sem explicação, o que o §6.2 proíbe.
 */
export function ProximasContas({
  itens,
  aPagar,
  aReceber,
  dias,
  nomeConta,
}: {
  itens: ContaProxima[]
  aPagar: Cents
  aReceber: Cents
  dias: number
  nomeConta: Map<string, string>
}) {
  const atrasadas = itens.filter((item) => item.atrasado)
  // Transferência aparece uma vez: o lado que sai. O que entra é o mesmo dinheiro.
  const visiveis = itens.filter((item) => item.kind !== 'transferencia' || item.direction === -1)

  return (
    <section aria-labelledby="titulo-proximas">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h2 id="titulo-proximas" className="text-lg font-semibold text-slate-900">
          Próximas contas
        </h2>
        <Link href="/recorrencias" className="text-sm font-medium text-marca-700 hover:underline">
          Recorrências
        </Link>
      </div>

      <Cartao>
        <dl className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100 text-sm">
          <div className="px-4 py-3">
            <dt className="text-slate-600">A pagar em {dias} dias</dt>
            <dd className="mt-0.5 text-lg font-semibold text-slate-900">
              <Valor centavos={aPagar} />
            </dd>
          </div>
          <div className="px-4 py-3">
            <dt className="text-slate-600">A receber em {dias} dias</dt>
            <dd className="mt-0.5 text-lg font-semibold text-marca-700">
              <Valor centavos={aReceber} />
            </dd>
          </div>
        </dl>

        {atrasadas.length > 0 && (
          <p role="status" className="flex items-center gap-2 border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-900">
            <span aria-hidden="true">⚠</span>
            {atrasadas.length === 1 ? '1 conta atrasada' : `${atrasadas.length} contas atrasadas`}
          </p>
        )}

        {visiveis.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-600">
            Nada vence nos próximos {dias} dias.{' '}
            <Link href="/recorrencias/nova" className="font-medium text-marca-700 hover:underline">
              Cadastrar uma conta que se repete
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visiveis.map((item) => {
              const vencimento = item.dueDate ?? item.competenceDate
              return (
                <li key={item.id}>
                  <Link
                    href={`/lancamentos/${item.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">
                        {item.recurrenceRuleId && (
                          <span aria-hidden="true" className="mr-1 text-slate-400">↻</span>
                        )}
                        {item.description}
                      </span>
                      <span className="block truncate text-xs text-slate-600">
                        Vence <time dateTime={vencimento}>{dataLonga(vencimento)}</time>
                        {' · '}
                        {nomeConta.get(item.accountId) ?? 'Conta'}
                        {item.kind === 'transferencia' && ' · Transferência'}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row-reverse sm:items-center sm:gap-3">
                      <span className="flex items-center gap-1">
                        {item.estimado && (
                          <span className="text-xs text-amber-800" title="Valor estimado">≈</span>
                        )}
                        <Valor
                          centavos={item.amountCents}
                          direcao={item.kind === 'transferencia' ? undefined : item.direction}
                          className="font-medium"
                        />
                        {item.estimado && <span className="sr-only">(valor estimado)</span>}
                      </span>
                      <StatusBadge status={item.status} atrasado={item.atrasado} />
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}

        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
          Vencimentos em fim de semana passam para segunda conforme a regra. Feriados ainda não
          são considerados.
        </p>
      </Cartao>
    </section>
  )
}
