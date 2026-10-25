import { listarContas } from '../../../data/accounts'
import { listarCategorias } from '../../../data/categories'
import { listarLancamentos } from '../../../data/transactions'
import { hojeEm, isoDate } from '../../../domain/dates'
import { estaAtrasado } from '../../../domain/transaction'
import { exigirUsuario } from '../../../lib/session'
import { dataLonga } from '../../../lib/format'
import { ItemLancamento } from '../../../components/item-lancamento'
import { SemDados, SemResultados } from '../../../components/states'
import { CabecalhoPagina, Cartao, LinkBotao } from '../../../components/ui'
import type { IsoDate, TransactionStatus } from '../../../domain/types'
import { Filtros } from './filtros'

export const metadata = { title: 'Lançamentos' }

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

  // Agrupado por data de competência, como num extrato. A lista já vem
  // ordenada por data decrescente, então basta cortar onde a data muda.
  const grupos: { data: IsoDate; itens: typeof resultado.itens }[] = []
  for (const item of resultado.itens) {
    const ultimo = grupos.at(-1)
    if (ultimo?.data === item.competenceDate) ultimo.itens.push(item)
    else grupos.push({ data: item.competenceDate, itens: [item] })
  }

  const linkPagina = (numero: number) => ({
    pathname: '/lancamentos',
    query: { ...params, pagina: numero },
  })

  return (
    <section className="space-y-6">
      <CabecalhoPagina
        titulo="Lançamentos"
        descricao={
          resultado.total > 0
            ? `${resultado.total} ${resultado.total === 1 ? 'lançamento' : 'lançamentos'}${temFiltro ? ' com os filtros aplicados' : ''}.`
            : undefined
        }
        acao={<LinkBotao href="/lancamentos/novo">Novo lançamento</LinkBotao>}
      />

      <Filtros
        contas={contas}
        categorias={categorias}
        temFiltro={temFiltro}
        atual={Object.fromEntries(
          Object.entries(params).filter(([, v]) => typeof v === 'string'),
        ) as Record<string, string>}
      />

      {resultado.total === 0 && !temFiltro && (
        <SemDados
          titulo="Nenhum lançamento ainda"
          descricao="Registre a primeira despesa ou receita. O saldo das contas passa a refletir isso na hora."
          acao={<LinkBotao href="/lancamentos/novo">Registrar lançamento</LinkBotao>}
        />
      )}

      {resultado.total === 0 && temFiltro && (
        <SemResultados acao={<LinkBotao href="/lancamentos" variante="secundario">Limpar filtros</LinkBotao>} />
      )}

      {grupos.map((grupo) => (
        <section key={grupo.data} aria-labelledby={`dia-${grupo.data}`}>
          <h2 id={`dia-${grupo.data}`} className="mb-2 text-sm font-semibold text-slate-600">
            <time dateTime={grupo.data}>{dataLonga(grupo.data)}</time>
          </h2>
          <Cartao>
            <ul className="divide-y divide-slate-100">
              {grupo.itens.map((item) => (
                <li key={item.id}>
                  <ItemLancamento
                    item={item}
                    nomeConta={nomeConta.get(item.accountId) ?? 'Conta'}
                    nomeCategoria={item.categoryId ? nomeCategoria.get(item.categoryId) ?? 'Categoria' : undefined}
                    atrasado={estaAtrasado(item, hoje)}
                  />
                </li>
              ))}
            </ul>
          </Cartao>
        </section>
      ))}

      {totalPaginas > 1 && (
        <nav aria-label="Paginação" className="flex items-center justify-between gap-3 text-sm">
          {pagina > 1 ? (
            <LinkBotao href={linkPagina(pagina - 1)} variante="secundario">
              <span aria-hidden="true">←</span> Anterior
            </LinkBotao>
          ) : (
            <span />
          )}
          <span className="text-slate-600">
            Página {pagina} de {totalPaginas}
          </span>
          {pagina < totalPaginas ? (
            <LinkBotao href={linkPagina(pagina + 1)} variante="secundario">
              Próxima <span aria-hidden="true">→</span>
            </LinkBotao>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  )
}
