import Link from 'next/link'
import type { ItemOrcamento } from '../data/budgets'
import { SituacaoOrcamento } from './orcamento'
import { Cartao, Valor } from './ui'

const GRAVIDADE = { estourado: 0, vai_estourar: 1, atencao: 2, dentro: 3 } as const

/** Até três categorias em pior situação, ou uma linha dizendo que está tudo dentro. */
export function OrcamentoResumo({ itens }: { itens: ItemOrcamento[] }) {
  if (itens.length === 0) return null
  const atencao = itens
    .filter((i) => i.avaliacao.situacao !== 'dentro')
    .sort((a, b) => GRAVIDADE[a.avaliacao.situacao] - GRAVIDADE[b.avaliacao.situacao])
    .slice(0, 3)

  return (
    <section aria-labelledby="titulo-orcamento">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="titulo-orcamento" className="text-lg font-semibold text-slate-900">Orçamento do mês</h2>
        <Link href="/orcamentos" className="text-sm font-medium text-marca-700 hover:underline">Ver orçamentos</Link>
      </div>
      <Cartao>
        {atencao.length === 0 ? (
          <p className="px-4 py-4 text-sm text-marca-800"><span aria-hidden="true">✓ </span>Todas as categorias dentro do orçamento.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {atencao.map((i) => (
              <li key={i.orcamentoId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="min-w-0">
                  <span className="block font-medium text-slate-900">{i.nome}</span>
                  <SituacaoOrcamento avaliacao={i.avaliacao} disponivel={i.disponivel} realizado={i.realizado} />
                </span>
                <span className="text-sm text-slate-700">
                  <Valor centavos={i.realizado} /> de <Valor centavos={i.disponivel} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </section>
  )
}
