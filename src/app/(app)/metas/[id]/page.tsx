import Link from 'next/link'
import { notFound } from 'next/navigation'
import { listarContasComSaldo } from '../../../../data/accounts'
import { buscarMeta, reservasPorConta, type MetaAvaliada } from '../../../../data/goals'
import { hojeEm } from '../../../../domain/dates'
import { simular } from '../../../../domain/goal'
import { cents, parseBRL } from '../../../../domain/money'
import type { Cents, IsoDate } from '../../../../domain/types'
import { exigirUsuario } from '../../../../lib/session'
import { dataCurta, dataLonga, dinheiro, mesAno } from '../../../../lib/format'
import { FormularioConfirmado } from '../../../../components/formulario-confirmado'
import { Aviso, Cartao, LinkBotao, Rotulo, Valor, classeEntrada, classesBotao } from '../../../../components/ui'
import { arquivar, concluir } from '../acoes'
import { FormularioReserva } from '../reserva'
import {
  AvisosAcimaDoSaldo,
  BarraMeta,
  PRIORIDADES,
  SituacaoDaMeta,
  TipoMeta,
  meses,
  textoRitmo,
} from '../../../../components/meta'

export const metadata = { title: 'Meta' }

const TIPOS_MOVIMENTO = {
  aporte: { texto: 'Reserva', icone: '+' },
  resgate: { texto: 'Resgate', icone: '−' },
  liberacao: { texto: 'Liberação', icone: '↺' },
} as const

/** Explicação do prazo inviável (spec 6.4). */
function Explicacao({ meta }: { meta: MetaAvaliada }) {
  const a = meta.avaliacao
  const frases: string[] = []
  if (a.situacao === 'fora_do_prazo' && a.mesProvavel && a.mesesDeAtraso !== null && a.mesesDeAtraso > 0) {
    frases.push(
      `No ritmo atual, conclui em ${mesAno(a.mesProvavel.inicio)}, ${meses(a.mesesDeAtraso)} depois da data-alvo.`,
    )
  } else if (a.situacao === 'fora_do_prazo' && a.ritmo && !a.mesProvavel) {
    // Ritmo existe, mas é minúsculo demais perto do alvo: a data passa do
    // limite de 100 anos (achado em revisão) e não dá para estimar.
    frases.push('No ritmo atual, levaria mais de 100 anos para concluir.')
  }
  if (a.faltariaNaData !== null && a.faltariaNaData > 0) {
    frases.push(
      a.situacao === 'prazo_vencido'
        ? `A data-alvo era ${dataLonga(meta.targetDate!)}; ainda faltam ${dinheiro(a.falta)}.`
        : `No ritmo atual, faltariam ${dinheiro(a.faltariaNaData)} na data-alvo.`,
    )
  }
  return frases.length === 0 ? null : (
    <div className="space-y-1">
      {frases.map((f) => (
        <p key={f}>{f}</p>
      ))}
    </div>
  )
}

function Opcoes({ meta }: { meta: MetaAvaliada }) {
  const opcoes = meta.avaliacao.opcoes
  if (!opcoes) return null
  const base = `/metas/${meta.id}/editar`
  const itens: { href: string; texto: string }[] = []
  if (opcoes.aumentarContribuicao !== null) {
    itens.push({
      href: `${base}?contribuicao=${opcoes.aumentarContribuicao}`,
      texto: `Aumentar a contribuição para ${dinheiro(opcoes.aumentarContribuicao)}/mês`,
    })
  }
  if (opcoes.reduzirAlvo !== null) {
    itens.push({ href: `${base}?alvo=${opcoes.reduzirAlvo}`, texto: `Reduzir o alvo para ${dinheiro(opcoes.reduzirAlvo)}` })
  }
  if (opcoes.mudarData !== null) {
    itens.push({ href: `${base}?data=${opcoes.mudarData}`, texto: `Mudar a data para ${dataLonga(opcoes.mudarData)}` })
  }
  if (itens.length === 0) return null

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">O que dá para fazer</h3>
      <ul className="mt-2 flex flex-wrap gap-2">
        {itens.map((item) => (
          <li key={item.href}>
            <LinkBotao href={item.href} variante="secundario">{item.texto}</LinkBotao>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-600">Cada opção abre o formulário preenchido; nada muda até você salvar.</p>
    </div>
  )
}

function Simulacao({
  meta,
  entrada,
  hoje,
  diaInicio,
}: {
  meta: MetaAvaliada
  entrada: string | null
  hoje: IsoDate
  diaInicio: number
}) {
  let resultado: string | null = null
  let erro: string | null = null

  if (entrada !== null && entrada.trim() !== '') {
    let valor: Cents | null = null
    try {
      valor = parseBRL(entrada)
    } catch {
      erro = 'Valor inválido. Use o formato 500,00.'
    }
    if (valor !== null && valor <= 0) {
      erro = 'Informe um valor mensal maior que zero.'
    } else if (valor !== null) {
      const s = simular(
        { alvo: meta.targetCents, reservado: meta.reservado, dataAlvo: meta.targetDate, hoje, diaInicio },
        valor,
      )
      if (s.mesProvavel === null) {
        // Contribuição minúscula perto do alvo: passa do limite de 100 anos
        // (achado em revisão) e não dá para estimar o mês provável.
        resultado = `Com ${dinheiro(valor)} por mês, levaria mais de 100 anos para concluir.`
      } else {
        const inicio = `Com ${dinheiro(valor)} por mês, conclui em ${mesAno(s.mesProvavel.inicio)}`
        if (s.mesesDeDiferenca === null) resultado = `${inicio}.`
        else if (s.mesesDeDiferenca === 0) resultado = `${inicio}, no mês da data-alvo.`
        else if (s.mesesDeDiferenca < 0) resultado = `${inicio}, ${meses(-s.mesesDeDiferenca)} antes da data-alvo.`
        else resultado = `${inicio}, ${meses(s.mesesDeDiferenca)} depois da data-alvo.`
      }
    }
  }

  return (
    <form method="get" className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Rotulo htmlFor="simular">Se eu contribuir por mês</Rotulo>
          <div className="relative">
            <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 mt-0.5 -translate-y-1/2 text-sm text-slate-500">R$</span>
            <input
              id="simular" name="simular" inputMode="decimal" placeholder="0,00"
              defaultValue={entrada ?? ''} aria-invalid={erro ? true : undefined}
              className={`${classeEntrada} pl-10 text-right tabular-nums`}
            />
          </div>
        </div>
        <button type="submit" className={classesBotao('secundario')}>Simular</button>
      </div>
      <div aria-live="polite">
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {resultado && <Aviso tipo="info">{resultado} É só uma simulação; nada foi salvo.</Aviso>}
      </div>
    </form>
  )
}

export default async function PaginaMeta({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const query = await searchParams
  const usuario = await exigirUsuario()
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const hoje = hojeEm(usuario.timezone)
  const dia = usuario.monthStartDay
  const encontrada = await buscarMeta(usuario.id, id, hoje, dia)
  if (!encontrada) notFound()
  const { meta, movimentos } = encontrada
  const a = meta.avaliacao
  const encerrada = meta.completedAt !== null || meta.archivedAt !== null

  const [contas, reservas] = encerrada
    ? [[], new Map<string, Cents>()]
    : await Promise.all([listarContasComSaldo(usuario.id), reservasPorConta(usuario.id)])
  const daMeta = new Map(meta.reservasPorConta.map((r) => [r.accountId, r.reservado]))
  const contasReserva = contas.map((c) => ({
    id: c.id,
    name: c.name,
    naoReservado: cents(c.balanceCents - (reservas.get(c.id) ?? 0)),
    daMeta: daMeta.get(c.id) ?? cents(0),
  }))
  const contaPadrao =
    meta.accountId && contas.some((c) => c.id === meta.accountId)
      ? meta.accountId
      : contas.length === 1
        ? contas[0].id
        : ''

  const liberacoes = meta.reservasPorConta.filter((r) => r.reservado > 0)
  const descricaoArquivar =
    liberacoes.length === 0
      ? 'Nada está reservado para esta meta, então nenhum valor é liberado. A meta sai da lista de ativas; o histórico fica guardado.'
      : `Será liberado: ${liberacoes.map((r) => `${dinheiro(r.reservado)} de ${r.accountName}`).join('; ')}. A meta sai da lista de ativas; o histórico fica guardado.`
  const descricaoConcluir =
    liberacoes.length === 0
      ? 'A meta vai para as concluídas.'
      : `A meta vai para as concluídas e a reserva é liberada: ${liberacoes.map((r) => `${dinheiro(r.reservado)} de ${r.accountName}`).join('; ')}.`

  const ritmo = textoRitmo(a)
  const entradaSimular = typeof query.simular === 'string' ? query.simular : null

  return (
    <section className="max-w-3xl space-y-6">
      <Link href="/metas" className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-marca-700 hover:underline">
        <span aria-hidden="true">←</span> Metas
      </Link>

      <Cartao className="space-y-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 [overflow-wrap:anywhere]">{meta.name}</h1>
            <p className="mt-1 flex flex-wrap gap-x-3">
              <TipoMeta kind={meta.kind} />
              <span className="text-sm text-slate-600">Prioridade {PRIORIDADES[meta.priority].toLowerCase()}</span>
            </p>
          </div>
          {encerrada ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-sm font-medium text-slate-700">
              <span aria-hidden="true">■</span>
              {meta.completedAt ? 'Concluída' : 'Arquivada'}
            </span>
          ) : (
            <LinkBotao href={`/metas/${meta.id}/editar`} variante="secundario">Editar</LinkBotao>
          )}
        </div>

        {!encerrada && (
          <>
            <BarraMeta nome={meta.name} reservado={meta.reservado} alvo={meta.targetCents} avaliacao={a} />
            <SituacaoDaMeta avaliacao={a} dataAlvo={meta.targetDate} />
            <AvisosAcimaDoSaldo reservas={meta.reservasPorConta} />

            <dl className="grid gap-x-6 gap-y-4 border-t border-slate-100 pt-5 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-600">Falta</dt>
                <dd className="font-medium text-slate-900"><Valor centavos={a.falta} /></dd>
              </div>
              <div>
                <dt className="text-slate-600">Data-alvo</dt>
                <dd className="font-medium text-slate-900">{meta.targetDate ? dataLonga(meta.targetDate) : 'Sem data-alvo'}</dd>
              </div>
              {a.necessaria !== null && meta.targetDate && (
                <div>
                  <dt className="text-slate-600">Contribuição necessária</dt>
                  <dd className="font-medium text-slate-900">
                    <Valor centavos={a.necessaria} />/mês até {dataLonga(meta.targetDate)}
                  </dd>
                </div>
              )}
              {ritmo && (
                <div>
                  <dt className="text-slate-600">Ritmo usado</dt>
                  <dd className="font-medium text-slate-900">
                    {ritmo}
                    {a.ritmo && (
                      <span className="block font-normal text-slate-600">
                        {a.mesProvavel
                          ? `Mês provável: ${mesAno(a.mesProvavel.inicio)} (estimativa)`
                          : 'Nesse ritmo, levaria mais de 100 anos'}
                      </span>
                    )}
                  </dd>
                </div>
              )}
            </dl>

            {a.opcoes && (
              <div className="space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                <Explicacao meta={meta} />
                <Opcoes meta={meta} />
              </div>
            )}
          </>
        )}

        {!encerrada && (
          <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-5">
            {a.atingida && (
              <FormularioConfirmado
                action={concluir}
                titulo={`Concluir ${meta.name}?`}
                descricao={descricaoConcluir}
                rotuloConfirmar="Concluir"
              >
                <input type="hidden" name="id" value={meta.id} />
                <button type="submit" className={classesBotao('primario')}>Concluir</button>
              </FormularioConfirmado>
            )}
            <FormularioConfirmado
              action={arquivar}
              titulo={`Arquivar ${meta.name}?`}
              descricao={descricaoArquivar}
              rotuloConfirmar="Arquivar"
              perigoso
            >
              <input type="hidden" name="id" value={meta.id} />
              <button type="submit" className={classesBotao('fantasma', 'text-red-800!')}>Arquivar</button>
            </FormularioConfirmado>
          </div>
        )}
      </Cartao>

      {!encerrada && !a.atingida && (
        <Cartao as="section" className="p-6">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Simular</h2>
          <Simulacao meta={meta} entrada={entradaSimular} hoje={hoje} diaInicio={dia} />
        </Cartao>
      )}

      {!encerrada && (
        <Cartao as="section" className="p-6">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Reservar e resgatar</h2>
          {contasReserva.length === 0 ? (
            <p className="text-sm text-slate-600">Cadastre uma conta para reservar dinheiro para a meta.</p>
          ) : (
            <FormularioReserva metaId={meta.id} contas={contasReserva} contaPadrao={contaPadrao} hoje={hoje} />
          )}
        </Cartao>
      )}

      <section aria-labelledby="titulo-movimentos">
        <h2 id="titulo-movimentos" className="mb-3 text-lg font-semibold text-slate-900">Movimentos</h2>
        {movimentos.length === 0 ? (
          <Cartao className="p-6 text-center text-sm text-slate-600">Nenhum movimento ainda.</Cartao>
        ) : (
          <Cartao>
            <ul className="divide-y divide-slate-100">
              {movimentos.map((m) => {
                const tipo = TIPOS_MOVIMENTO[m.kind]
                return (
                  <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 p-4 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">
                        <span aria-hidden="true">{tipo.icone} </span>
                        {tipo.texto}
                      </p>
                      <p className="text-xs text-slate-600 [overflow-wrap:anywhere]">
                        {dataCurta(m.occurredOn)} · {m.accountName}
                      </p>
                    </div>
                    <Valor centavos={cents(Math.abs(m.amountCents))} direcao={m.amountCents > 0 ? 1 : -1} />
                  </li>
                )
              })}
            </ul>
          </Cartao>
        )}
      </section>
    </section>
  )
}
