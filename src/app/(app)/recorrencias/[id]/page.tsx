import Link from 'next/link'
import { notFound } from 'next/navigation'
import { buscarRegra, ocorrenciasDaRegra } from '../../../../data/recurrences'
import { listarContas } from '../../../../data/accounts'
import { listarCategorias } from '../../../../data/categories'
import { hojeEm } from '../../../../domain/dates'
import { descreverRegra, proximaOcorrencia, reservaMensal } from '../../../../domain/recurrence'
import { estaAtrasado } from '../../../../domain/transaction'
import { exigirUsuario } from '../../../../lib/session'
import { dataLonga } from '../../../../lib/format'
import { FormularioConfirmado } from '../../../../components/formulario-confirmado'
import { ItemLancamento } from '../../../../components/item-lancamento'
import { Aviso, Cartao, Valor, classesBotao } from '../../../../components/ui'
import { encerrar, pausar, retomar } from '../acoes'

export const metadata = { title: 'Recorrência' }

const ESTADOS = {
  ativa: { texto: 'Ativa', icone: '↻', classe: 'border-marca-100 bg-marca-50 text-marca-800' },
  pausada: { texto: 'Pausada', icone: '⏸', classe: 'border-amber-200 bg-amber-50 text-amber-900' },
  encerrada: { texto: 'Encerrada', icone: '■', classe: 'border-slate-300 bg-slate-100 text-slate-700' },
} as const

export default async function PaginaRegra({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await exigirUsuario()
  const regra = await buscarRegra(usuario.id, id)
  if (!regra) notFound()

  const [lista, contas, categorias] = await Promise.all([
    ocorrenciasDaRegra(usuario.id, regra.id),
    listarContas(usuario.id, { incluirArquivadas: true }),
    listarCategorias(usuario.id, { incluirArquivadas: true }),
  ])
  const hoje = hojeEm(usuario.timezone)
  const nomeConta = new Map(contas.map((conta) => [conta.id, conta.name]))
  const categoria = categorias.find((c) => c.id === regra.categoryId)
  // Ativa com fim por data já passado terminou de fato (é o que sobra da
  // regra antiga depois de um "desta em diante"): mostrada como encerrada.
  const estadoAtual =
    regra.status === 'ativa' && regra.endDate !== null && regra.endDate < hoje ? 'encerrada' : regra.status
  const estado = ESTADOS[estadoAtual]

  // Na transferência, um lado basta: o outro é o mesmo dinheiro chegando.
  const ocorrencias = lista.filter((o) => o.kind !== 'transferencia' || o.direction === -1)
  const emAberto = ocorrencias.filter((o) => o.status === 'previsto' || o.status === 'pendente')
  const historico = ocorrencias.filter((o) => !emAberto.includes(o)).reverse()
  const proxima = emAberto.find((o) => (o.dueDate ?? o.competenceDate) >= hoje) ?? emAberto[0]

  // Reserva sugerida só para o que vem de longe em longe (spec 6.7).
  const espacada = regra.unit === 'ano' || (regra.unit === 'mes' && regra.interval >= 3)
  // Sem ocorrência gerada (além dos 90 dias), a data vem da própria regra.
  const vencimento = proxima
    ? (proxima.dueDate ?? proxima.competenceDate)
    : estadoAtual === 'ativa'
      ? (proximaOcorrencia(regra, hoje)?.vencimento ?? null)
      : null
  const reserva =
    espacada && estadoAtual === 'ativa' && vencimento && regra.kind === 'despesa'
      ? reservaMensal(regra.amountCents, hoje, vencimento)
      : null

  return (
    <section className="max-w-3xl space-y-6">
      <Link href="/recorrencias" className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-marca-700 hover:underline">
        <span aria-hidden="true">←</span> Recorrências
      </Link>

      <Cartao className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 [overflow-wrap:anywhere]">
              {regra.description}
            </h1>
            <p className="mt-1 text-slate-700">{descreverRegra(regra)}</p>
          </div>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm font-medium ${estado.classe}`}>
            <span aria-hidden="true">{estado.icone}</span>
            {estado.texto}
          </span>
        </div>

        <dl className="mt-6 grid gap-x-6 gap-y-4 border-t border-slate-100 pt-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-600">Valor</dt>
            <dd className="font-medium text-slate-900">
              <Valor
                centavos={regra.amountCents}
                direcao={regra.kind === 'transferencia' ? undefined : regra.kind === 'receita' ? 1 : -1}
              />
              {regra.amountIsEstimate && <span className="text-slate-600"> (estimado; muda a cada vez)</span>}
            </dd>
          </div>
          <div>
            <dt className="text-slate-600">{regra.kind === 'transferencia' ? 'De → para' : 'Conta'}</dt>
            <dd className="font-medium text-slate-900">
              {nomeConta.get(regra.accountId) ?? '—'}
              {regra.kind === 'transferencia' && ` → ${nomeConta.get(regra.toAccountId ?? '') ?? '—'}`}
            </dd>
          </div>
          {categoria && (
            <div>
              <dt className="text-slate-600">Categoria</dt>
              <dd className="font-medium text-slate-900">{categoria.name}</dd>
            </div>
          )}
          <div>
            <dt className="text-slate-600">Fim de semana</dt>
            <dd className="font-medium text-slate-900">
              {regra.weekendPolicy === 'proximo_dia_util' ? 'Vence na segunda-feira' : 'Vence no próprio dia'}
            </dd>
          </div>
          {estadoAtual === 'ativa' && vencimento && (
            <div>
              <dt className="text-slate-600">Próximo vencimento</dt>
              <dd className="font-medium text-slate-900">{dataLonga(vencimento)}</dd>
            </div>
          )}
        </dl>

        {reserva && (
          <Aviso tipo="info" className="mt-5">
            Para ter <Valor centavos={regra.amountCents} /> em {dataLonga(vencimento!)}, separe{' '}
            <strong><Valor centavos={reserva.porMes} /></strong> por mês
            {reserva.meses === 1 ? ' neste mês.' : ` nos próximos ${reserva.meses} meses.`}{' '}
            É só uma sugestão: nada é reservado automaticamente.
          </Aviso>
        )}

        <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-100 pt-5">
          {proxima && estadoAtual === 'ativa' && (
            <Link href={`/lancamentos/${proxima.id}`} className={classesBotao('secundario')}>
              Mudar valor ou data daqui em diante
            </Link>
          )}
          {estadoAtual === 'ativa' && (
            <form action={pausar}>
              <input type="hidden" name="id" value={regra.id} />
              <button type="submit" className={classesBotao('secundario')}>Pausar</button>
            </form>
          )}
          {estadoAtual === 'pausada' && (
            <form action={retomar}>
              <input type="hidden" name="id" value={regra.id} />
              <button type="submit" className={classesBotao('primario')}>Retomar a partir de hoje</button>
            </form>
          )}
          {estadoAtual !== 'encerrada' && (
            <FormularioConfirmado
              action={encerrar}
              titulo={`Encerrar ${regra.description}?`}
              descricao="As próximas ocorrências que ainda não foram pagas somem. O que já foi pago fica no histórico. Uma recorrência encerrada não volta; para recomeçar, crie outra."
              rotuloConfirmar="Encerrar"
              perigoso
            >
              <input type="hidden" name="id" value={regra.id} />
              <button type="submit" className={classesBotao('fantasma', 'text-red-800!')}>Encerrar</button>
            </FormularioConfirmado>
          )}
        </div>
        {estadoAtual === 'pausada' && (
          <p className="mt-3 text-xs text-slate-600">
            Pausada em {dataLonga(regra.pausedAt!)}. Ao retomar, as datas dentro da pausa não voltam.
          </p>
        )}
      </Cartao>

      <section aria-labelledby="titulo-abertas">
        <h2 id="titulo-abertas" className="mb-3 text-lg font-semibold text-slate-900">Em aberto</h2>
        {emAberto.length === 0 ? (
          <Cartao className="p-6 text-center text-sm text-slate-600">
            {estadoAtual === 'ativa' && vencimento
              ? `Nenhuma ocorrência em aberto. A de ${dataLonga(vencimento)} aparece aqui 90 dias antes.`
              : 'Nenhuma ocorrência em aberto.'}
          </Cartao>
        ) : (
          <Cartao>
            <ul className="divide-y divide-slate-100">
              {emAberto.map((item) => (
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

      {historico.length > 0 && (
        <section aria-labelledby="titulo-historico">
          <h2 id="titulo-historico" className="mb-3 text-lg font-semibold text-slate-900">Histórico</h2>
          <Cartao>
            <ul className="divide-y divide-slate-100">
              {historico.map((item) => (
                <li key={item.id}>
                  <ItemLancamento
                    item={item}
                    nomeConta={nomeConta.get(item.accountId) ?? 'Conta'}
                    atrasado={false}
                    mostrarData
                  />
                </li>
              ))}
            </ul>
          </Cartao>
        </section>
      )}
    </section>
  )
}
