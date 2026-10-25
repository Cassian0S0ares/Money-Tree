import Link from 'next/link'
import { listarContas } from '../../../data/accounts'
import { listarCategorias } from '../../../data/categories'
import { listarLancamentos } from '../../../data/transactions'
import { hojeEm, isoDate } from '../../../domain/dates'
import { estaAtrasado } from '../../../domain/transaction'
import { exigirUsuario } from '../../../lib/session'
import { dataCurta, dinheiro } from '../../../lib/format'
import { StatusBadge } from '../../../components/status-badge'
import { SemDados, SemResultados } from '../../../components/states'
import type { IsoDate, TransactionStatus } from '../../../domain/types'
import { Filtros } from './filtros'

const POR_PAGINA = 50

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ESTADOS: ReadonlySet<string> = new Set<TransactionStatus>([
  'previsto', 'pendente', 'liquidado', 'conciliado', 'cancelado', 'estornado',
])

/**
 * A URL é editável por quem usa. Valor fora do formato vira "sem filtro" em
 * vez de chegar ao SQL e derrubar a página com erro de tipo do Postgres.
 */
function uuidOpcional(valor: string | undefined): string | undefined {
  return valor && UUID.test(valor) ? valor : undefined
}

function estadoOpcional(valor: string | undefined): TransactionStatus | undefined {
  return valor && ESTADOS.has(valor) ? (valor as TransactionStatus) : undefined
}

function dataOpcional(valor: string | undefined): IsoDate | undefined {
  if (!valor) return undefined
  try {
    return isoDate(valor)
  } catch {
    return undefined
  }
}

export default async function PaginaLancamentos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const usuario = await exigirUsuario()
  const params = await searchParams
  const texto = (chave: string) => (typeof params[chave] === 'string' ? params[chave] : undefined)

  const pagina = Math.max(1, Math.floor(Number(texto('pagina'))) || 1)

  const [contas, categorias, resultado] = await Promise.all([
    listarContas(usuario.id),
    listarCategorias(usuario.id),
    listarLancamentos(usuario.id, {
      accountId: uuidOpcional(texto('conta')),
      categoryId: uuidOpcional(texto('categoria')),
      status: estadoOpcional(texto('estado')),
      de: dataOpcional(texto('de')),
      ate: dataOpcional(texto('ate')),
      limite: POR_PAGINA,
      deslocamento: (pagina - 1) * POR_PAGINA,
    }),
  ])

  const hoje = hojeEm(usuario.timezone)
  const nomeConta = new Map(contas.map((conta) => [conta.id, conta.name]))
  const nomeCategoria = new Map(categorias.map((categoria) => [categoria.id, categoria.name]))
  const temFiltro = ['conta', 'categoria', 'estado', 'de', 'ate'].some((chave) => texto(chave))
  const totalPaginas = Math.max(1, Math.ceil(resultado.total / POR_PAGINA))

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Lançamentos</h1>
        <Link href="/lancamentos/novo" className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">
          Novo lançamento
        </Link>
      </div>

      <Filtros
        contas={contas}
        categorias={categorias}
        atual={Object.fromEntries(
          Object.entries(params).filter(([, v]) => typeof v === 'string'),
        ) as Record<string, string>}
      />

      {resultado.total === 0 && !temFiltro && (
        <SemDados
          titulo="Nenhum lançamento ainda"
          descricao="Registre a primeira despesa ou receita. O saldo das contas passa a refletir isso na hora."
          acao={
            <Link href="/lancamentos/novo" className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">
              Registrar lançamento
            </Link>
          }
        />
      )}

      {resultado.total === 0 && temFiltro && <SemResultados />}

      {resultado.total > 0 && (
        <>
          <p className="text-sm text-slate-600">
            {resultado.total} {resultado.total === 1 ? 'lançamento' : 'lançamentos'}
          </p>

          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {resultado.itens.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <Link href={`/lancamentos/${item.id}`} className="font-medium hover:underline">
                    {/* React escapa por padrão; o texto vem do usuário e é
                        tratado como não confiável (§5.3). */}
                    {item.description}
                  </Link>
                  <p className="text-sm text-slate-600">
                    {dataCurta(item.competenceDate)} · {nomeConta.get(item.accountId) ?? 'Conta'}
                    {item.categoryId && ` · ${nomeCategoria.get(item.categoryId) ?? 'Categoria'}`}
                    {item.kind === 'transferencia' && ' · Transferência'}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <StatusBadge status={item.status} atrasado={estaAtrasado(item, hoje)} />
                  <span
                    className={`tabular-nums ${item.direction === 1 ? 'text-emerald-800' : 'text-slate-900'}`}
                  >
                    {item.direction === 1 ? '+' : '−'} {dinheiro(item.amountCents)}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {totalPaginas > 1 && (
            <nav aria-label="Paginação" className="flex items-center justify-between text-sm">
              {pagina > 1 ? (
                <Link
                  href={{ pathname: '/lancamentos', query: { ...params, pagina: pagina - 1 } }}
                  className="underline"
                >
                  Anterior
                </Link>
              ) : (
                <span />
              )}
              <span>Página {pagina} de {totalPaginas}</span>
              {pagina < totalPaginas ? (
                <Link
                  href={{ pathname: '/lancamentos', query: { ...params, pagina: pagina + 1 } }}
                  className="underline"
                >
                  Próxima
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </section>
  )
}
