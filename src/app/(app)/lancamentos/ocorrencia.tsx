'use client'

import { useActionState } from 'react'
import {
  editarOcorrenciaAcao,
  pagarOcorrenciaAcao,
  type EstadoEdicaoOcorrencia,
  type EstadoPagamento,
} from './acoes'
import { cents } from '../../../domain/money'
import { valorParaEntrada } from '../../../lib/format'
import { Aviso, Cartao, Dica, Rotulo, Valor, classeEntrada, classesBotao } from '../../../components/ui'
import type { Cents } from '../../../domain/types'

/**
 * Pagar uma ocorrência com o valor real. Fica montado mesmo depois de pago
 * (só o formulário some), para o aviso de valor incomum continuar na tela
 * quando a página recarrega com o lançamento já liquidado.
 */
export function PagarOcorrencia({
  id,
  valor,
  estimado,
  hoje,
  podePagar,
}: {
  id: string
  valor: Cents
  estimado: boolean
  hoje: string
  podePagar: boolean
}) {
  const [estado, acao, enviando] = useActionState<EstadoPagamento, FormData>(pagarOcorrenciaAcao, {})

  if (estado.pago) {
    return (
      <div className="space-y-3">
        <Aviso tipo="sucesso">Pagamento registrado.</Aviso>
        {estado.aviso && (
          <Aviso tipo="info">
            <Valor centavos={valor} /> é {estado.aviso.percentual}%{' '}
            {estado.aviso.sentido === 'acima' ? 'acima' : 'abaixo'} do habitual (mediana de{' '}
            <Valor centavos={cents(estado.aviso.mediana)} /> nos três últimos pagamentos). Só um
            aviso: nada foi alterado na recorrência.
          </Aviso>
        )}
      </div>
    )
  }

  if (!podePagar) return null

  return (
    <Cartao as="section" className="p-6">
      <h2 className="text-base font-semibold text-slate-900">Pagar</h2>
      <p className="mt-1 text-sm text-slate-600">
        {estimado
          ? 'O valor desta conta muda a cada vez. Confira o valor real antes de confirmar.'
          : 'A partir daí ele passa a contar no saldo da conta.'}
      </p>
      <form action={acao} className="mt-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="id" value={id} />
        {estado.erro && <Aviso tipo="erro" className="w-full">{estado.erro}</Aviso>}
        <div>
          <Rotulo htmlFor="valor-pago">{estimado ? 'Valor real' : 'Valor'}</Rotulo>
          <div className="relative">
            <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 mt-0.5 -translate-y-1/2 text-sm text-slate-500">
              R$
            </span>
            <input
              id="valor-pago" name="valor" inputMode="decimal" required
              defaultValue={valorParaEntrada(valor)}
              aria-invalid={estado.erro ? true : undefined}
              autoFocus={estimado}
              className={`${classeEntrada} w-40! pl-10 text-right font-medium tabular-nums`}
            />
          </div>
        </div>
        <div>
          <Rotulo htmlFor="quando">Pago em</Rotulo>
          <input id="quando" name="quando" type="date" required defaultValue={hoje} className={classeEntrada} />
        </div>
        <button type="submit" disabled={enviando} className={classesBotao('primario')}>
          {enviando ? 'Registrando…' : 'Marcar como pago'}
        </button>
      </form>
    </Cartao>
  )
}

/**
 * Editar uma ocorrência ainda não paga. A pergunta do escopo é explícita e
 * vem antes do botão: só esta, ou esta e as próximas (spec 6.4). Para
 * ocorrência paga o formulário nem aparece: resta estornar.
 */
export function EditarOcorrencia({
  id,
  descricao,
  valor,
  vencimento,
}: {
  id: string
  descricao: string
  valor: Cents
  vencimento: string
}) {
  const [estado, acao, enviando] = useActionState(
    async (anterior: EstadoEdicaoOcorrencia, formData: FormData) => ({
      ...(await editarOcorrenciaAcao(anterior, formData)),
      chave: (anterior.chave ?? 0) + 1,
    }),
    {} as EstadoEdicaoOcorrencia,
  )
  const v = estado.valores ?? {}

  return (
    <Cartao as="section" className="p-6">
      <details open={Boolean(estado.erro)} className="group">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between text-base font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
          Editar
          <span aria-hidden="true" className="text-slate-500 transition-transform group-open:rotate-180">▾</span>
        </summary>
        <form key={estado.chave} action={acao} className="mt-4 space-y-5">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="vencimentoOriginal" value={vencimento} />
          {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}

          <div>
            <Rotulo htmlFor="ed-descricao">Descrição</Rotulo>
            <input id="ed-descricao" name="description" required defaultValue={v.description ?? descricao} className={classeEntrada} />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Rotulo htmlFor="ed-valor">Valor</Rotulo>
              <input
                id="ed-valor" name="valor" inputMode="decimal" required
                defaultValue={v.valor ?? valorParaEntrada(valor)}
                className={`${classeEntrada} text-right tabular-nums`}
              />
            </div>
            <div>
              <Rotulo htmlFor="ed-vencimento">Vencimento</Rotulo>
              <input id="ed-vencimento" name="vencimento" type="date" required defaultValue={v.vencimento ?? vencimento} className={classeEntrada} />
            </div>
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-slate-800">Aplicar a</legend>
            <div className="mt-2 space-y-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm has-[:checked]:border-marca-700 has-[:checked]:bg-marca-50">
                <input type="radio" name="escopo" value="esta" defaultChecked={v.escopo !== 'serie'} className="mt-0.5 size-4 accent-marca-700" />
                <span>
                  <span className="font-medium text-slate-900">Só esta ocorrência</span>
                  <span className="block text-xs text-slate-600">As outras continuam como estão.</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm has-[:checked]:border-marca-700 has-[:checked]:bg-marca-50">
                <input type="radio" name="escopo" value="serie" defaultChecked={v.escopo === 'serie'} className="mt-0.5 size-4 accent-marca-700" />
                <span>
                  <span className="font-medium text-slate-900">Esta e as próximas</span>
                  <span className="block text-xs text-slate-600">
                    O que já foi pago, pulado ou editado sozinho não muda. Mudar a data muda o dia
                    das próximas também.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          <Dica>Ocorrência já paga não se edita: a correção é estorno.</Dica>
          <button type="submit" disabled={enviando} className={classesBotao('primario')}>
            {enviando ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </form>
      </details>
    </Cartao>
  )
}
