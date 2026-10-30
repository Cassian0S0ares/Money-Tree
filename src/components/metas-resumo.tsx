import Link from 'next/link'
import type { MetaAvaliada } from '../data/goals'
import { mesAno } from '../lib/format'
import { SemDados } from './states'
import { AvisosAcimaDoSaldo, BarraMeta, SituacaoDaMeta, TipoMeta } from './meta'
import { Cartao, LinkBotao } from './ui'

/**
 * Até três metas ativas na tela inicial, na ordem de `listarMetas`
 * (prioridade, depois data-alvo; spec da fatia 4, seção 8). Sem metas,
 * convida a criar a primeira — mesmo padrão de `/metas`.
 */
export function MetasResumo({ ativas }: { ativas: MetaAvaliada[] }) {
  const destaques = ativas.slice(0, 3)

  return (
    <section aria-labelledby="titulo-metas">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="titulo-metas" className="text-lg font-semibold text-slate-900">Metas</h2>
        <Link href="/metas" className="text-sm font-medium text-marca-700 hover:underline">Ver metas</Link>
      </div>
      {destaques.length === 0 ? (
        <SemDados
          titulo="Nenhuma meta ainda"
          descricao="Uma meta diz quanto você quer juntar e, se quiser, até quando."
          acao={<LinkBotao href="/metas/nova">Criar meta</LinkBotao>}
        />
      ) : (
        <Cartao>
          <ul className="divide-y divide-slate-100">
            {destaques.map((meta) => (
              <li key={meta.id} className="space-y-2 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="min-w-0 font-medium text-slate-900 [overflow-wrap:anywhere]">
                    <Link href={`/metas/${meta.id}`} className="hover:text-marca-700 hover:underline">
                      {meta.name}
                    </Link>
                  </h3>
                  <TipoMeta kind={meta.kind} />
                </div>
                <BarraMeta nome={meta.name} reservado={meta.reservado} alvo={meta.targetCents} avaliacao={meta.avaliacao} />
                <SituacaoDaMeta avaliacao={meta.avaliacao} dataAlvo={meta.targetDate} />
                {meta.avaliacao.mesProvavel && !meta.avaliacao.atingida && (
                  <p className="text-xs text-slate-600">
                    Mês provável: {mesAno(meta.avaliacao.mesProvavel.inicio)} (estimativa)
                  </p>
                )}
                <AvisosAcimaDoSaldo reservas={meta.reservasPorConta} />
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </section>
  )
}
