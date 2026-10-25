'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { desfazer, salvarLancamento, type EstadoFormularioLancamento } from './acoes'
import { ToastDesfazer } from '../../../components/toast'
import { Aviso, Cartao, Dica, Rotulo, classeEntrada, classesBotao } from '../../../components/ui'
import type { Conta } from '../../../data/accounts'
import type { Categoria } from '../../../data/categories'
import type { TransactionKind } from '../../../domain/types'
import { isoDate } from '../../../domain/dates'
import { descreverRegra, ocorrencias, type RegraDatas, type UnidadeRecorrencia } from '../../../domain/recurrence'
import { dataLonga } from '../../../lib/format'

/** Frequências comuns; a tela de recorrências tem todas as combinações. */
const FREQUENCIAS: { valor: string; rotulo: string }[] = [
  { valor: 'semana:1', rotulo: 'Toda semana' },
  { valor: 'semana:2', rotulo: 'A cada 2 semanas' },
  { valor: 'mes:1', rotulo: 'Todo mês' },
  { valor: 'mes:2', rotulo: 'A cada 2 meses' },
  { valor: 'mes:3', rotulo: 'A cada 3 meses' },
  { valor: 'mes:6', rotulo: 'A cada 6 meses' },
  { valor: 'ano:1', rotulo: 'Todo ano' },
]

/** Mesmo cálculo do servidor, para a pessoa conferir antes de salvar. */
function previaRepeticao(data: string, frequencia: string, vezes: string, tipo: TransactionKind) {
  try {
    const startDate = isoDate(data)
    const [unit, intervalo] = frequencia.split(':') as [UnidadeRecorrencia, string]
    const regra: RegraDatas = {
      startDate,
      unit,
      interval: Number(intervalo),
      dayOfMonth: unit === 'mes' || unit === 'ano' ? Number(startDate.slice(8, 10)) : null,
      endDate: null,
      maxOccurrences: vezes ? Number(vezes) : null,
      weekendPolicy: tipo === 'despesa' ? 'proximo_dia_util' : 'manter',
    }
    const proximas = ocorrencias(regra, startDate, isoDate('2100-12-31')).slice(1, 4)
    return { texto: descreverRegra(regra), proximas }
  } catch {
    return null
  }
}

const TIPOS: { valor: TransactionKind; rotulo: string; icone: string }[] = [
  { valor: 'despesa', rotulo: 'Despesa', icone: '−' },
  { valor: 'receita', rotulo: 'Receita', icone: '+' },
  { valor: 'transferencia', rotulo: 'Transferência', icone: '⇄' },
  { valor: 'ajuste', rotulo: 'Ajuste', icone: '±' },
]

const INICIAL: EstadoFormularioLancamento = {}

/** Categorias do tipo, com as subcategorias logo abaixo do grupo. */
function opcoesCategoria(categorias: Categoria[], kind: 'receita' | 'despesa') {
  const doTipo = categorias.filter((categoria) => categoria.kind === kind)
  return doTipo
    .filter((categoria) => categoria.parentId === null)
    .flatMap((raiz) => [
      { id: raiz.id, rotulo: raiz.name },
      ...doTipo
        .filter((filha) => filha.parentId === raiz.id)
        .map((filha) => ({ id: filha.id, rotulo: `${raiz.name} › ${filha.name}` })),
    ])
}

export function FormularioLancamento({
  contas,
  categorias,
  hoje,
}: {
  contas: Conta[]
  categorias: Categoria[]
  hoje: string
}) {
  // O React 19 reseta o formulário depois da ação, e <select> não volta ao
  // defaultValue. Remontar a cada resposta faz todo campo reaplicar o que o
  // usuário tinha digitado (§13).
  const [estado, acao, enviando] = useActionState(
    async (anterior: EstadoFormularioLancamento, formData: FormData) => ({
      ...(await salvarLancamento(anterior, formData)),
      chave: (anterior.chave ?? 0) + 1,
    }),
    INICIAL,
  )
  const [tipo, setTipo] = useState<TransactionKind>('despesa')
  const [status, setStatus] = useState('liquidado')
  const [repetir, setRepetir] = useState(false)
  const [frequencia, setFrequencia] = useState('mes:1')
  const [vezes, setVezes] = useState('')
  const [dataLancamento, setDataLancamento] = useState(hoje)
  const v = estado.valores ?? {}
  const invalido = (campo: string) => (estado.campoInvalido === campo ? true : undefined)

  const ehTransferencia = tipo === 'transferencia'
  const ehAjuste = tipo === 'ajuste'
  const aceitaCategoria = !ehTransferencia && !ehAjuste
  // Com uma conta só, escolher é cerimônia: ela já vem selecionada.
  const contaPadrao = contas.length === 1 ? contas[0].id : ''

  return (
    <>
      <Cartao className="max-w-2xl p-6">
        <form key={estado.chave} action={acao} className="space-y-6">
          {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}

          <fieldset>
            <legend className="text-sm font-medium text-slate-800">Tipo</legend>
            {/* Rádios de verdade, só com cara de botões segmentados: setas do
                teclado e leitor de tela funcionam como em qualquer grupo. */}
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TIPOS.map((opcao) => (
                <label
                  key={opcao.valor}
                  className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 has-[:checked]:border-marca-700 has-[:checked]:bg-marca-50 has-[:checked]:text-marca-900 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-marca-800"
                >
                  <input
                    type="radio" name="kind" value={opcao.valor} className="sr-only"
                    checked={tipo === opcao.valor}
                    onChange={() => setTipo(opcao.valor)}
                  />
                  <span aria-hidden="true">{opcao.icone}</span>
                  {opcao.rotulo}
                </label>
              ))}
            </div>
            {ehTransferencia && (
              <Dica>
                Transferência move dinheiro entre contas suas. Não é receita nem despesa, e por
                isso não leva categoria.
              </Dica>
            )}
            {ehAjuste && (
              <Dica>
                Ajuste corrige o saldo quando ele não bate com a realidade. Prefira registrar o
                lançamento que falta; ajuste é a saída quando isso não é possível.
              </Dica>
            )}
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-[1fr_12rem]">
            <div>
              <Rotulo htmlFor="description">Descrição</Rotulo>
              <input
                id="description" name="description" required
                placeholder={ehTransferencia ? 'Ex.: Reserva de emergência' : 'Ex.: Mercado da semana'}
                autoFocus={invalido('description')} aria-invalid={invalido('description')}
                defaultValue={v.description ?? ''}
                className={classeEntrada}
              />
            </div>

            <div>
              <Rotulo htmlFor="valor">Valor</Rotulo>
              <div className="relative">
                <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 mt-0.5 -translate-y-1/2 text-sm text-slate-500">
                  R$
                </span>
                <input
                  id="valor" name="valor" inputMode="decimal" placeholder="0,00" required
                  aria-describedby="valor-dica"
                  autoFocus={invalido('valor')} aria-invalid={invalido('valor')}
                  defaultValue={v.valor ?? ''}
                  className={`${classeEntrada} pl-10 text-right text-lg font-medium tabular-nums`}
                />
              </div>
              <Dica id="valor-dica">Sempre positivo.</Dica>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Rotulo htmlFor="accountId">{ehTransferencia ? 'Sai de' : 'Conta'}</Rotulo>
              <select
                id="accountId" name="accountId" required
                aria-invalid={invalido('accountId')}
                defaultValue={v.accountId ?? contaPadrao}
                className={classeEntrada}
              >
                <option value="">Escolha…</option>
                {contas.map((conta) => (
                  <option key={conta.id} value={conta.id}>{conta.name}</option>
                ))}
              </select>
            </div>

            {ehTransferencia ? (
              <div>
                <Rotulo htmlFor="toAccountId">Entra em</Rotulo>
                <select
                  id="toAccountId" name="toAccountId" required
                  aria-invalid={invalido('toAccountId')}
                  defaultValue={v.toAccountId ?? ''}
                  className={classeEntrada}
                >
                  <option value="">Escolha…</option>
                  {contas.map((conta) => (
                    <option key={conta.id} value={conta.id}>{conta.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <Rotulo htmlFor="competenceDate">Data</Rotulo>
                <input
                  id="competenceDate" name="competenceDate" type="date" required
                  aria-invalid={invalido('competenceDate')}
                  defaultValue={v.competenceDate ?? hoje}
                  onChange={(e) => setDataLancamento(e.target.value)}
                  className={classeEntrada}
                />
              </div>
            )}
          </div>

          {ehTransferencia && (
            <div className="sm:w-1/2 sm:pr-2.5">
              <Rotulo htmlFor="competenceDate">Data</Rotulo>
              <input
                id="competenceDate" name="competenceDate" type="date" required
                aria-invalid={invalido('competenceDate')}
                defaultValue={v.competenceDate ?? hoje}
                onChange={(e) => setDataLancamento(e.target.value)}
                className={classeEntrada}
              />
            </div>
          )}

          {aceitaCategoria && (
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <Rotulo htmlFor="categoryId">Categoria</Rotulo>
                <select
                  id="categoryId" name="categoryId" defaultValue={v.categoryId ?? ''}
                  className={classeEntrada}
                >
                  <option value="">Sem categoria</option>
                  {opcoesCategoria(categorias, tipo === 'receita' ? 'receita' : 'despesa').map((opcao) => (
                    <option key={opcao.id} value={opcao.id}>{opcao.rotulo}</option>
                  ))}
                </select>
              </div>

              <div>
                <Rotulo htmlFor="nature">Natureza</Rotulo>
                <select
                  id="nature" name="nature" defaultValue={v.nature ?? 'variavel'}
                  aria-describedby="nature-dica"
                  className={classeEntrada}
                >
                  <option value="variavel">Variável</option>
                  <option value="fixa">Fixa</option>
                </select>
                <Dica id="nature-dica">Fixa se repete todo mês com valor parecido.</Dica>
              </div>
            </div>
          )}

          {ehAjuste && (
            <div className="grid gap-5 sm:grid-cols-[12rem_1fr]">
              <div>
                <Rotulo htmlFor="direcaoAjuste">Efeito no saldo</Rotulo>
                <select
                  id="direcaoAjuste" name="direcaoAjuste" defaultValue={v.direcaoAjuste ?? '1'}
                  className={classeEntrada}
                >
                  <option value="1">Aumenta</option>
                  <option value="-1">Reduz</option>
                </select>
              </div>
              <div>
                <Rotulo htmlFor="adjustmentReason">Motivo do ajuste</Rotulo>
                <input
                  id="adjustmentReason" name="adjustmentReason" required
                  aria-describedby="adjustmentReason-dica"
                  aria-invalid={invalido('adjustmentReason')}
                  defaultValue={v.adjustmentReason ?? ''}
                  className={classeEntrada}
                />
                <Dica id="adjustmentReason-dica">
                  Fica registrado: ajuste sem explicação reescreve o histórico em silêncio.
                </Dica>
              </div>
            </div>
          )}

          {!ehAjuste && (
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-start gap-3">
                <input
                  id="repetir" name="repetir" type="checkbox"
                  checked={repetir} onChange={(e) => setRepetir(e.target.checked)}
                  aria-describedby="repetir-dica"
                  className="mt-0.5 size-5 accent-marca-700"
                />
                <div>
                  <label htmlFor="repetir" className="text-sm font-medium text-slate-900">
                    <span aria-hidden="true">↻ </span>Repetir
                  </label>
                  <p id="repetir-dica" className="text-xs text-slate-600">
                    Este lançamento vira a primeira vez, e as próximas aparecem como previstas.
                  </p>
                </div>
              </div>

              {repetir && (() => {
                const [unit, intervalo] = frequencia.split(':')
                const resumo = previaRepeticao(dataLancamento, frequencia, vezes, tipo)
                return (
                  <div className="mt-4 space-y-4">
                    <input type="hidden" name="repeteUnit" value={unit} />
                    <input type="hidden" name="repeteInterval" value={intervalo} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Rotulo htmlFor="frequencia">Frequência</Rotulo>
                        <select
                          id="frequencia" value={frequencia} onChange={(e) => setFrequencia(e.target.value)}
                          className={classeEntrada}
                        >
                          {FREQUENCIAS.map((f) => (
                            <option key={f.valor} value={f.valor}>{f.rotulo}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Rotulo htmlFor="repeteVezes" opcional>Quantas vezes</Rotulo>
                        <input
                          id="repeteVezes" name="repeteVezes" type="number" min={1} inputMode="numeric"
                          placeholder="Sem fim" value={vezes} onChange={(e) => setVezes(e.target.value)}
                          className={classeEntrada}
                        />
                      </div>
                    </div>
                    {!ehTransferencia && (
                      <label className="flex items-start gap-3 text-sm">
                        <input name="amountIsEstimate" type="checkbox" className="mt-0.5 size-5 accent-marca-700" />
                        <span>
                          <span className="font-medium text-slate-900">O valor muda a cada vez</span>
                          <span className="block text-xs text-slate-600">Como luz e água: o real é pedido na hora de pagar.</span>
                        </span>
                      </label>
                    )}
                    <div aria-live="polite" className="rounded-lg bg-marca-50 p-3 text-sm text-marca-900">
                      {resumo ? (
                        <>
                          <p className="font-semibold">{resumo.texto}</p>
                          {resumo.proximas.length > 0 && (
                            <p className="mt-1">
                              Próximas: {resumo.proximas.map((o) => dataLonga(isoDate(o.vencimento))).join('; ')}
                            </p>
                          )}
                        </>
                      ) : (
                        <p>Escolha a data para ver as próximas.</p>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          <div className="grid gap-5 border-t border-slate-100 pt-5 sm:grid-cols-2">
            <div>
              <Rotulo htmlFor="status">Situação</Rotulo>
              <select
                id="status" name="status" value={status} onChange={(e) => setStatus(e.target.value)}
                aria-describedby="status-dica"
                className={classeEntrada}
              >
                <option value="liquidado">Já pago ou recebido</option>
                <option value="pendente">Pendente</option>
                <option value="previsto">Previsto</option>
              </select>
              <Dica id="status-dica">
                {status === 'liquidado'
                  ? 'Entra no saldo da conta agora.'
                  : 'Não entra no saldo até ser marcado como liquidado.'}
              </Dica>
            </div>

            {status === 'liquidado' && (
              <div>
                <Rotulo htmlFor="settledDate" opcional>Data do pagamento</Rotulo>
                <input
                  id="settledDate" name="settledDate" type="date"
                  aria-describedby="settledDate-dica"
                  defaultValue={v.settledDate ?? ''}
                  className={classeEntrada}
                />
                <Dica id="settledDate-dica">Vazio usa a data do lançamento.</Dica>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={enviando} className={classesBotao('primario')}>
              {enviando ? 'Salvando…' : repetir && !ehAjuste ? 'Salvar e repetir' : 'Salvar lançamento'}
            </button>
            <Link href="/lancamentos" className={classesBotao('fantasma')}>
              Ver lançamentos
            </Link>
          </div>
        </form>
      </Cartao>

      {estado.criadoId && (
        <ToastDesfazer
          key={estado.criadoId}
          mensagem="Lançamento registrado."
          aoDesfazer={
            estado.podeDesfazer
              ? () => {
                  const dados = new FormData()
                  dados.set('id', estado.criadoId!)
                  void desfazer(dados)
                }
              : undefined
          }
        />
      )}
    </>
  )
}
