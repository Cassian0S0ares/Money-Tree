import Link from 'next/link'
import { resumoOrcamento, type ItemOrcamento } from '../../../data/budgets'
import { hojeEm, isoDate, mesFinanceiro } from '../../../domain/dates'
import { diasDoPeriodo, periodoAnterior, proximoPeriodo, type Periodo } from '../../../domain/budget'
import { exigirUsuario } from '../../../lib/session'
import { dinheiro, rotuloPeriodo, valorParaEntrada } from '../../../lib/format'
import { FormularioConfirmado } from '../../../components/formulario-confirmado'
import { BarraOrcamento, SituacaoOrcamento } from '../../../components/orcamento'
import { Aviso, CabecalhoPagina, Cartao, LinkBotao, Valor } from '../../../components/ui'
import { removerOrcamentoAcao } from './acoes'
import { FormularioLimite } from './formulario'

export const metadata = { title: 'Orçamentos' }

const GRAVIDADE = { estourado: 0, vai_estourar: 1, atencao: 2, dentro: 3 } as const

function inicioDaUrl(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  try {
    return isoDate(valor)
  } catch {
    return null
  }
}

function Linha({
  item,
  periodosDoFormulario,
  encerrado,
}: {
  item: ItemOrcamento
  periodosDoFormulario: { inicio: string; rotulo: string }[]
  encerrado: boolean
}) {
  const { avaliacao } = item
  return (
    <li className="space-y-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-slate-900">{item.nome}</h3>
        <p className="text-sm text-slate-700">
          <Valor centavos={item.realizado} className="font-semibold text-slate-900" /> de{' '}
          <Valor centavos={item.disponivel} />
          {avaliacao.percentual !== null && <span className="text-slate-500"> · {avaliacao.percentual}%</span>}
        </p>
      </div>

      <BarraOrcamento
        nome={item.nome}
        disponivel={item.disponivel}
        realizado={item.realizado}
        comprometido={item.comprometido}
        avaliacao={avaliacao}
      />

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 text-sm">
        <div className="space-y-1">
          <SituacaoOrcamento avaliacao={avaliacao} disponivel={item.disponivel} realizado={item.realizado} />
          <p className="text-xs text-slate-600">
            {item.comprometido > 0 && <>Comprometido: {dinheiro(item.comprometido)} · </>}
            {avaliacao.restante >= 0 ? `Resta ${dinheiro(avaliacao.restante)}` : `Passou ${dinheiro(Math.abs(avaliacao.restante) as typeof avaliacao.restante)}`}
            {avaliacao.esperadoHoje !== null && <> · Esperado até hoje: {dinheiro(avaliacao.esperadoHoje)}</>}
          </p>
          {item.rollover && item.disponivel > item.limite && (
            <p className="text-xs text-slate-600">
              Limite {dinheiro(item.limite)} + {dinheiro((item.disponivel - item.limite) as typeof item.limite)} que sobrou do mês anterior
            </p>
          )}
        </div>

        {!encerrado && (
        <div className="flex flex-wrap items-start gap-2">
          <FormularioLimite
            categoriaId={item.categoriaId}
            orcamentoId={item.orcamentoId}
            valorAtual={valorParaEntrada(item.limite)}
            rollover={item.rollover}
            periodos={periodosDoFormulario}
            nome={item.nome}
          />
          <FormularioConfirmado
            action={removerOrcamentoAcao}
            titulo={`Remover o orçamento de ${item.nome}?`}
            descricao="A categoria fica sem limite. Os gastos não mudam, e o histórico de limites é guardado."
            rotuloConfirmar="Remover"
          >
            <input type="hidden" name="id" value={item.orcamentoId} />
            <button type="submit" className="min-h-10 rounded-lg px-2 text-sm text-slate-600 hover:bg-slate-100">
              Remover<span className="sr-only"> orçamento de {item.nome}</span>
            </button>
          </FormularioConfirmado>
        </div>
        )}
      </div>
    </li>
  )
}

export default async function PaginaOrcamentos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const usuario = await exigirUsuario()
  const params = await searchParams
  const hoje = hojeEm(usuario.timezone)
  const dia = usuario.monthStartDay

  const atual = mesFinanceiro(hoje, dia)
  const pedido = inicioDaUrl(params.inicio)
  const periodo: Periodo = pedido ? mesFinanceiro(isoDate(pedido), dia) : atual
  const anterior = periodoAnterior(periodo, dia)
  const proximo = proximoPeriodo(periodo, dia)

  const resumo = await resumoOrcamento(usuario.id, periodo, hoje, dia)
  const itens = [...resumo.itens].sort(
    (a, b) => GRAVIDADE[a.avaliacao.situacao] - GRAVIDADE[b.avaliacao.situacao] || a.nome.localeCompare(b.nome),
  )

  // Limite muda deste mês em diante, ou do próximo: nunca de um mês passado.
  const proximoDoAtual = proximoPeriodo(atual, dia)
  const periodosDoFormulario = [
    { inicio: atual.inicio, rotulo: `Este mês (${rotuloPeriodo(atual.inicio, atual.fim)})` },
    { inicio: proximoDoAtual.inicio, rotulo: `O próximo (${rotuloPeriodo(proximoDoAtual.inicio, proximoDoAtual.fim)})` },
  ]

  const corrente = periodo.inicio === atual.inicio
  // Limite vale do mês atual em diante; em período encerrado não se define.
  const encerrado = periodo.fim < atual.inicio
  const diaDoPeriodo = corrente
    ? Math.round((Date.parse(hoje) - Date.parse(periodo.inicio)) / 86_400_000) + 1
    : null

  return (
    <section className="space-y-6">
      <CabecalhoPagina
        titulo="Orçamentos"
        descricao="Quanto você pretende gastar por mês em cada categoria, e como está indo."
      />

      <nav aria-label="Período" className="flex flex-wrap items-center justify-between gap-3">
        <LinkBotao href={`/orcamentos?inicio=${anterior.inicio}`} variante="secundario">
          <span aria-hidden="true">←</span> Anterior
        </LinkBotao>
        <div className="text-center">
          <h2 className="font-semibold text-slate-900 first-letter:uppercase">
            {rotuloPeriodo(periodo.inicio, periodo.fim)}
          </h2>
          <p className="text-xs text-slate-600">
            {diaDoPeriodo !== null
              ? `Dia ${diaDoPeriodo} de ${diasDoPeriodo(periodo)}`
              : periodo.fim < hoje
                ? 'Período encerrado'
                : 'Período futuro'}
          </p>
        </div>
        <LinkBotao href={`/orcamentos?inicio=${proximo.inicio}`} variante="secundario">
          Próximo <span aria-hidden="true">→</span>
        </LinkBotao>
      </nav>

      {!corrente && (
        <p className="text-center text-sm">
          <Link href="/orcamentos" className="font-medium text-marca-700 hover:underline">Voltar para o mês atual</Link>
        </p>
      )}

      {itens.length > 0 && (
        <Cartao>
          <dl className="grid grid-cols-2 divide-slate-100 text-sm sm:grid-cols-4 sm:divide-x">
            <div className="px-4 py-3">
              <dt className="text-slate-600">Planejado</dt>
              <dd className="text-lg font-semibold"><Valor centavos={resumo.totais.disponivel} /></dd>
            </div>
            <div className="px-4 py-3">
              <dt className="text-slate-600">Gasto</dt>
              <dd className="text-lg font-semibold"><Valor centavos={resumo.totais.realizadoComOrcamento} /></dd>
            </div>
            <div className="px-4 py-3">
              <dt className="text-slate-600">Comprometido</dt>
              <dd className="text-lg font-semibold"><Valor centavos={resumo.totais.comprometidoComOrcamento} /></dd>
            </div>
            <div className="px-4 py-3">
              <dt className="text-slate-600">{resumo.totais.restante >= 0 ? 'Resta' : 'Passou'}</dt>
              <dd className={`text-lg font-semibold ${resumo.totais.restante < 0 ? 'text-red-800' : ''}`}>
                <Valor centavos={Math.abs(resumo.totais.restante) as typeof resumo.totais.restante} />
              </dd>
            </div>
          </dl>
        </Cartao>
      )}

      <Aviso tipo="info">
        Orçamento é um plano de gasto: ele ainda não separa dinheiro das contas. A barra mostra o
        gasto; a faixa listrada, o que já está previsto; o traço, o esperado até hoje.
      </Aviso>

      <section aria-labelledby="titulo-com">
        <h2 id="titulo-com" className="mb-3 text-lg font-semibold text-slate-900">
          Com limite <span className="text-sm font-normal text-slate-500">({itens.length})</span>
        </h2>
        {itens.length === 0 ? (
          <Cartao className="p-6 text-center text-sm text-slate-600">
            {encerrado
              ? 'Nenhuma categoria tinha limite neste período.'
              : 'Nenhuma categoria com limite neste período. Defina um abaixo.'}
          </Cartao>
        ) : (
          <Cartao>
            <ul className="divide-y divide-slate-100">
              {itens.map((item) => (
                <Linha key={item.orcamentoId} item={item} periodosDoFormulario={periodosDoFormulario} encerrado={encerrado} />
              ))}
            </ul>
          </Cartao>
        )}
      </section>

      {resumo.semOrcamento.length > 0 && (
        <section aria-labelledby="titulo-sem">
          <h2 id="titulo-sem" className="mb-1 text-lg font-semibold text-slate-900">Sem limite</h2>
          <p className="mb-3 text-sm text-slate-600">
            {dinheiro(resumo.totais.realizadoSemOrcamento)} gastos neste período em categorias sem limite.
          </p>
          <Cartao>
            <ul className="divide-y divide-slate-100">
              {resumo.semOrcamento.map((s) => (
                <li key={s.categoriaId} className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium text-slate-900">{s.nome}</p>
                    <p className="text-xs text-slate-600">
                      Gasto: {dinheiro(s.realizado)}
                      {s.comprometido > 0 && ` · comprometido: ${dinheiro(s.comprometido)}`}
                    </p>
                  </div>
                  {!encerrado && (
                    <FormularioLimite
                      categoriaId={s.categoriaId}
                      rollover={false}
                      periodos={periodosDoFormulario}
                      nome={s.nome}
                    />
                  )}
                </li>
              ))}
            </ul>
          </Cartao>
        </section>
      )}
    </section>
  )
}
