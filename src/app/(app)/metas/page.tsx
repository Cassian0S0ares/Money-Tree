import Link from 'next/link'
import { listarMetas } from '../../../data/goals'
import { hojeEm } from '../../../domain/dates'
import { exigirUsuario } from '../../../lib/session'
import { dinheiro, mesAno } from '../../../lib/format'
import { SemDados } from '../../../components/states'
import { CabecalhoPagina, Cartao, LinkBotao } from '../../../components/ui'
import { AvisosAcimaDoSaldo, BarraMeta, SituacaoDaMeta, TipoMeta, TIPOS_META } from './pecas'

export const metadata = { title: 'Metas' }

export default async function PaginaMetas() {
  const usuario = await exigirUsuario()
  const hoje = hojeEm(usuario.timezone)
  const { ativas, encerradas } = await listarMetas(usuario.id, hoje, usuario.monthStartDay)

  return (
    <section className="space-y-6">
      <CabecalhoPagina
        titulo="Metas"
        descricao="Para que você está guardando dinheiro, quanto já separou e quando deve chegar lá."
        acao={<LinkBotao href="/metas/nova">Nova meta</LinkBotao>}
      />

      {ativas.length === 0 ? (
        <SemDados
          titulo="Nenhuma meta ainda"
          descricao="Uma meta diz quanto você quer juntar e, se quiser, até quando. A reserva separa parte do saldo de uma conta para ela."
          acao={<LinkBotao href="/metas/nova">Criar meta</LinkBotao>}
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {ativas.map((meta) => (
            <li key={meta.id}>
              <Cartao className="h-full space-y-3 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="min-w-0 font-semibold text-slate-900 [overflow-wrap:anywhere]">
                    <Link href={`/metas/${meta.id}`} className="hover:text-marca-700 hover:underline">
                      {meta.name}
                    </Link>
                  </h2>
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
              </Cartao>
            </li>
          ))}
        </ul>
      )}

      {encerradas.length > 0 && (
        <details className="group">
          <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1 rounded-lg px-2 text-sm font-medium text-marca-700 hover:bg-marca-50 [&::-webkit-details-marker]:hidden">
            Concluídas e arquivadas ({encerradas.length})
            <span aria-hidden="true" className="transition-transform group-open:rotate-180">▾</span>
          </summary>
          <Cartao className="mt-3">
            <ul className="divide-y divide-slate-100">
              {encerradas.map((meta) => (
                <li key={meta.id} className="flex flex-wrap items-baseline justify-between gap-2 p-4 text-sm">
                  <Link href={`/metas/${meta.id}`} className="min-w-0 font-medium text-slate-900 hover:underline [overflow-wrap:anywhere]">
                    {meta.name}
                  </Link>
                  <span className="text-slate-600">
                    <span aria-hidden="true">{TIPOS_META[meta.kind].icone} </span>
                    {meta.completedAt ? 'Concluída' : 'Arquivada'} · alvo {dinheiro(meta.targetCents)}
                  </span>
                </li>
              ))}
            </ul>
          </Cartao>
        </details>
      )}
    </section>
  )
}
