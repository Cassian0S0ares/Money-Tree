'use client'

import { useActionState } from 'react'
import { definirLimite, type EstadoLimite } from './acoes'
import { Aviso, Dica, Rotulo, classeEntrada, classesBotao } from '../../../components/ui'

/**
 * Definir ou mudar o limite. A pergunta "a partir de quando" é explícita:
 * mudar nunca reescreve os meses anteriores (spec da fatia 3, seção 4.2).
 */
export function FormularioLimite({
  categoriaId,
  orcamentoId,
  valorAtual,
  rollover,
  periodos,
  nome,
}: {
  categoriaId: string
  orcamentoId?: string
  valorAtual?: string
  rollover: boolean
  periodos: { inicio: string; rotulo: string }[]
  nome: string
}) {
  // Remonta a cada resposta: o reset do React 19 não devolve <select> ao
  // defaultValue (§13).
  const [estado, acao, enviando] = useActionState(
    async (anterior: EstadoLimite, formData: FormData) => ({
      ...(await definirLimite(anterior, formData)),
      chave: (anterior.chave ?? 0) + 1,
    }),
    {} as EstadoLimite,
  )
  const v = estado.valores ?? {}
  const id = (campo: string) => `${campo}-${categoriaId}`

  return (
    <details className="group" open={Boolean(estado.erro)}>
      <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1 rounded-lg px-2 text-sm font-medium text-marca-700 hover:bg-marca-50 [&::-webkit-details-marker]:hidden">
        {orcamentoId ? 'Mudar limite' : 'Definir limite'}
        <span className="sr-only"> de {nome}</span>
        <span aria-hidden="true" className="transition-transform group-open:rotate-180">▾</span>
      </summary>

      <form key={estado.chave} action={acao} className="mt-3 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <input type="hidden" name="categoriaId" value={categoriaId} />
        {orcamentoId && <input type="hidden" name="orcamentoId" value={orcamentoId} />}
        <input type="hidden" name="rolloverAntes" value={rollover ? 'on' : ''} />
        {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
        {estado.sucesso && <Aviso tipo="sucesso">Limite salvo.</Aviso>}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Rotulo htmlFor={id('valor')}>Limite por mês</Rotulo>
            <div className="relative">
              <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 mt-0.5 -translate-y-1/2 text-sm text-slate-500">R$</span>
              <input
                id={id('valor')} name="valor" inputMode="decimal" required placeholder="0,00"
                defaultValue={v.valor ?? valorAtual ?? ''}
                aria-invalid={estado.erro ? true : undefined}
                className={`${classeEntrada} pl-10 text-right tabular-nums`}
              />
            </div>
          </div>
          <div>
            <Rotulo htmlFor={id('aPartirDe')}>A partir de</Rotulo>
            <select id={id('aPartirDe')} name="aPartirDe" defaultValue={v.aPartirDe ?? periodos[0].inicio} className={classeEntrada}>
              {periodos.map((p) => (
                <option key={p.inicio} value={p.inicio}>{p.rotulo}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <input
            id={id('rollover')} name="rollover" type="checkbox"
            defaultChecked={v.rollover ? v.rollover === 'on' : rollover}
            aria-describedby={id('rollover-dica')}
            className="mt-0.5 size-5 accent-marca-700"
          />
          <div>
            <label htmlFor={id('rollover')} className="text-sm font-medium text-slate-900">
              Acumular a sobra para o mês seguinte
            </label>
            <Dica id={id('rollover-dica')}>Só a sobra passa adiante; estouro não vira dívida do mês seguinte.</Dica>
          </div>
        </div>

        <button type="submit" disabled={enviando} className={classesBotao('primario')}>
          {enviando ? 'Salvando…' : 'Salvar limite'}
        </button>
      </form>
    </details>
  )
}
