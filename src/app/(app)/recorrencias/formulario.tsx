'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { salvarRegra, type EstadoFormularioRegra } from './acoes'
import type { Conta } from '../../../data/accounts'
import type { Categoria } from '../../../data/categories'
import { isoDate } from '../../../domain/dates'
import {
  descreverRegra,
  ocorrencias,
  validarRegra,
  type RegraDatas,
  type UnidadeRecorrencia,
} from '../../../domain/recurrence'
import { dataLonga } from '../../../lib/format'
import { Aviso, Cartao, Dica, Rotulo, classeEntrada, classesBotao } from '../../../components/ui'

type Tipo = 'despesa' | 'receita' | 'transferencia'

const TIPOS: { valor: Tipo; rotulo: string; icone: string }[] = [
  { valor: 'despesa', rotulo: 'Despesa', icone: '−' },
  { valor: 'receita', rotulo: 'Receita', icone: '+' },
  { valor: 'transferencia', rotulo: 'Transferência', icone: '⇄' },
]

const UNIDADES: { valor: UnidadeRecorrencia; singular: string; plural: string }[] = [
  { valor: 'dia', singular: 'dia', plural: 'dias' },
  { valor: 'semana', singular: 'semana', plural: 'semanas' },
  { valor: 'mes', singular: 'mês', plural: 'meses' },
  { valor: 'ano', singular: 'ano', plural: 'anos' },
]

const INICIAL: EstadoFormularioRegra = {}

/**
 * Prévia da regra: o mesmo cálculo do servidor, rodando aqui. Mostra o texto
 * e as próximas três datas para a pessoa conferir antes de salvar (spec,
 * seção 8). Com dado incompleto ou inválido, não mostra nada.
 */
function previa(campos: {
  unit: UnidadeRecorrencia
  interval: string
  startDate: string
  fim: string
  endDate: string
  maxOccurrences: string
  weekendPolicy: RegraDatas['weekendPolicy']
}): { texto: string; datas: { nominal: string; vencimento: string }[] } | null {
  try {
    const startDate = isoDate(campos.startDate)
    const mensal = campos.unit === 'mes' || campos.unit === 'ano'
    const regra: RegraDatas = {
      startDate,
      unit: campos.unit,
      interval: Number(campos.interval),
      dayOfMonth: mensal ? Number(startDate.slice(8, 10)) : null,
      endDate: campos.fim === 'data' && campos.endDate ? isoDate(campos.endDate) : null,
      maxOccurrences: campos.fim === 'vezes' && campos.maxOccurrences ? Number(campos.maxOccurrences) : null,
      weekendPolicy: campos.weekendPolicy,
    }
    validarRegra(regra)
    const datas = ocorrencias(regra, startDate, isoDate('2100-12-31')).slice(0, 3)
    return { texto: descreverRegra(regra), datas }
  } catch {
    return null
  }
}

export function FormularioRegra({
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
  // usuário tinha digitado (§13). Os campos que alimentam a prévia são
  // controlados e sobrevivem sozinhos.
  const [estado, acao, enviando] = useActionState(
    async (anterior: EstadoFormularioRegra, formData: FormData) => ({
      ...(await salvarRegra(anterior, formData)),
      chave: (anterior.chave ?? 0) + 1,
    }),
    INICIAL,
  )
  const v = estado.valores ?? {}
  const invalido = (campo: string) => (estado.campoInvalido === campo ? true : undefined)

  const [tipo, setTipo] = useState<Tipo>('despesa')
  const [unit, setUnit] = useState<UnidadeRecorrencia>('mes')
  const [intervalo, setIntervalo] = useState('1')
  const [startDate, setStartDate] = useState(hoje)
  const [fim, setFim] = useState('nunca')
  const [endDate, setEndDate] = useState('')
  const [maxOccurrences, setMaxOccurrences] = useState('')
  // Decisão 2 da spec: despesa passa para o dia útil; receita e
  // transferência ficam na data. Escolha manual vale até trocar o tipo.
  const [weekendPolicy, setWeekendPolicy] = useState<RegraDatas['weekendPolicy']>('proximo_dia_util')

  const ehTransferencia = tipo === 'transferencia'
  const contaPadrao = contas.length === 1 ? contas[0].id : ''
  const unidade = UNIDADES.find((u) => u.valor === unit)!
  const resumo = previa({ unit, interval: intervalo, startDate, fim, endDate, maxOccurrences, weekendPolicy })

  return (
    <Cartao className="max-w-2xl p-6">
      <form key={estado.chave} action={acao} className="space-y-6">
        {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}

        <fieldset>
          <legend className="text-sm font-medium text-slate-800">Tipo</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {TIPOS.map((opcao) => (
              <label
                key={opcao.valor}
                className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 has-[:checked]:border-marca-700 has-[:checked]:bg-marca-50 has-[:checked]:text-marca-900 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-marca-800"
              >
                <input
                  type="radio" name="kind" value={opcao.valor} className="sr-only"
                  checked={tipo === opcao.valor}
                  onChange={() => {
                    setTipo(opcao.valor)
                    setWeekendPolicy(opcao.valor === 'despesa' ? 'proximo_dia_util' : 'manter')
                  }}
                />
                <span aria-hidden="true">{opcao.icone}</span>
                {opcao.rotulo}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-[1fr_12rem]">
          <div>
            <Rotulo htmlFor="description">Descrição</Rotulo>
            <input
              id="description" name="description" required
              placeholder={ehTransferencia ? 'Ex.: Reserva de emergência' : 'Ex.: Aluguel'}
              aria-invalid={invalido('description')} autoFocus={invalido('description')}
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
                aria-invalid={invalido('valor')} autoFocus={invalido('valor')}
                defaultValue={v.valor ?? ''}
                className={`${classeEntrada} pl-10 text-right text-lg font-medium tabular-nums`}
              />
            </div>
          </div>
        </div>

        {!ehTransferencia && (
          <div className="flex items-start gap-3">
            <input
              id="amountIsEstimate" name="amountIsEstimate" type="checkbox"
              aria-describedby="amountIsEstimate-dica"
              defaultChecked={v.amountIsEstimate === 'on'}
              className="mt-0.5 size-5 accent-marca-700"
            />
            <div>
              <label htmlFor="amountIsEstimate" className="text-sm font-medium text-slate-900">
                O valor muda a cada vez
              </label>
              <p id="amountIsEstimate-dica" className="text-xs text-slate-600">
                Como luz e água. O valor acima vira estimativa, e o real é pedido na hora de pagar.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Rotulo htmlFor="accountId">{ehTransferencia ? 'Sai de' : 'Conta'}</Rotulo>
            <select
              id="accountId" name="accountId" required aria-invalid={invalido('accountId')}
              defaultValue={v.accountId ?? contaPadrao} className={classeEntrada}
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
                id="toAccountId" name="toAccountId" required aria-invalid={invalido('toAccountId')}
                defaultValue={v.toAccountId ?? ''} className={classeEntrada}
              >
                <option value="">Escolha…</option>
                {contas.map((conta) => (
                  <option key={conta.id} value={conta.id}>{conta.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <Rotulo htmlFor="categoryId">Categoria</Rotulo>
              <select id="categoryId" name="categoryId" defaultValue={v.categoryId ?? ''} className={classeEntrada}>
                <option value="">Sem categoria</option>
                {categorias
                  .filter((categoria) => categoria.kind === (tipo === 'receita' ? 'receita' : 'despesa'))
                  .map((categoria) => (
                    <option key={categoria.id} value={categoria.id}>{categoria.name}</option>
                  ))}
              </select>
            </div>
          )}
        </div>

        <fieldset className="space-y-5 border-t border-slate-100 pt-5">
          <legend className="sr-only">Quando se repete</legend>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Rotulo htmlFor="startDate">Primeira vez</Rotulo>
              <input
                id="startDate" name="startDate" type="date" required
                aria-invalid={invalido('startDate')} aria-describedby="startDate-dica"
                value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className={classeEntrada}
              />
              <Dica id="startDate-dica">Também define o dia: todo dia 5, toda sexta…</Dica>
            </div>

            <div>
              <span id="frequencia-rotulo" className="block text-sm font-medium text-slate-800">
                Repete a cada
              </span>
              <div className="mt-1 flex gap-2" role="group" aria-labelledby="frequencia-rotulo">
                <input
                  name="interval" type="number" min={1} max={366} required inputMode="numeric"
                  aria-label="Intervalo" aria-invalid={invalido('interval')}
                  value={intervalo} onChange={(e) => setIntervalo(e.target.value)}
                  className={`${classeEntrada} mt-0 w-20! text-center tabular-nums`}
                />
                <select
                  name="unit" aria-label="Unidade"
                  value={unit} onChange={(e) => setUnit(e.target.value as UnidadeRecorrencia)}
                  className={`${classeEntrada} mt-0`}
                >
                  {UNIDADES.map((u) => (
                    <option key={u.valor} value={u.valor}>
                      {intervalo === '1' ? u.singular : u.plural}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-slate-800">Até quando</legend>
            <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
              <label className="flex min-h-10 items-center gap-2">
                <input type="radio" name="fim" value="nunca" checked={fim === 'nunca'} onChange={() => setFim('nunca')} className="size-4 accent-marca-700" />
                Sem data para acabar
              </label>
              <label className="flex min-h-10 items-center gap-2">
                <input type="radio" name="fim" value="vezes" checked={fim === 'vezes'} onChange={() => setFim('vezes')} className="size-4 accent-marca-700" />
                Por
                <input
                  name="maxOccurrences" type="number" min={1} inputMode="numeric" aria-label="Número de vezes"
                  aria-invalid={invalido('maxOccurrences')}
                  disabled={fim !== 'vezes'} value={maxOccurrences}
                  onChange={(e) => setMaxOccurrences(e.target.value)}
                  className={`${classeEntrada} mt-0 w-20! text-center`}
                />
                vezes
              </label>
              <label className="flex min-h-10 items-center gap-2">
                <input type="radio" name="fim" value="data" checked={fim === 'data'} onChange={() => setFim('data')} className="size-4 accent-marca-700" />
                Até
                <input
                  name="endDate" type="date" aria-label="Data final" aria-invalid={invalido('endDate')}
                  disabled={fim !== 'data'} value={endDate} onChange={(e) => setEndDate(e.target.value)}
                  className={`${classeEntrada} mt-0`}
                />
              </label>
            </div>
          </fieldset>

          <div className="sm:w-1/2 sm:pr-2.5">
            <Rotulo htmlFor="weekendPolicy">Se cair no fim de semana</Rotulo>
            <select
              id="weekendPolicy" name="weekendPolicy"
              value={weekendPolicy}
              onChange={(e) => setWeekendPolicy(e.target.value as RegraDatas['weekendPolicy'])}
              className={classeEntrada}
            >
              <option value="proximo_dia_util">Vence na segunda-feira</option>
              <option value="manter">Vence no próprio dia</option>
            </select>
          </div>
        </fieldset>

        <div aria-live="polite" className="rounded-lg border border-marca-100 bg-marca-50 p-4 text-sm">
          {resumo ? (
            <>
              <p className="font-semibold text-marca-900">
                <span aria-hidden="true">↻ </span>
                {resumo.texto}
              </p>
              <p className="mt-2 text-marca-900">Próximas datas:</p>
              <ul className="mt-1 space-y-0.5 text-marca-900">
                {resumo.datas.map((data) => (
                  <li key={data.nominal}>
                    {dataLonga(isoDate(data.vencimento))}
                    {data.vencimento !== data.nominal && (
                      <span className="text-marca-800"> (cairia em {dataLonga(isoDate(data.nominal))}, fim de semana)</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-marca-900">
              Preencha a primeira vez e a frequência para ver as próximas datas.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={enviando} className={classesBotao('primario')}>
            {enviando ? 'Salvando…' : 'Criar recorrência'}
          </button>
          <Link href="/recorrencias" className={classesBotao('fantasma')}>Cancelar</Link>
        </div>

        <p className="text-xs text-slate-500">
          As ocorrências aparecem como previstas até 90 dias à frente, nunca como pagas.
          {unidade.valor === 'dia' && ' Repetição diária gera muitas linhas; confira se é isso mesmo.'}
        </p>
      </form>
    </Cartao>
  )
}
