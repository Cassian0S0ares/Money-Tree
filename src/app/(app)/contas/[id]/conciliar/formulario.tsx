'use client'

import { useActionState } from 'react'
import { conciliarConta, type EstadoConciliacao } from './acoes'
import { dinheiro } from '../../../../../lib/format'
import { cents } from '../../../../../domain/money'

const INICIAL: EstadoConciliacao = { etapa: 'informar' }

const ROTULOS: Record<string, { titulo: string; ajuda: string }> = {
  lancamento_localizado: {
    titulo: 'Vou procurar o lançamento que falta',
    ajuda:
      'Registra a divergência sem alterar nada. Lance o que falta e concilie de novo; até lá o saldo segue estimado.',
  },
  duplicidade_removida: {
    titulo: 'Havia um lançamento repetido e já corrigi',
    ajuda:
      'Registra a divergência sem alterar nada. Concilie de novo depois da correção; até lá o saldo segue estimado.',
  },
  ajuste_criado: {
    titulo: 'Criar um ajuste com a diferença',
    ajuda: 'Gera um lançamento de ajuste com o motivo que você escrever. Use quando a busca não resolveu.',
  },
  adiado: {
    titulo: 'Deixar para depois',
    ajuda: 'Registra a divergência sem corrigi-la. Ela continua visível.',
  },
}

export function FormularioConciliacao({
  accountId,
  nomeConta,
}: {
  accountId: string
  nomeConta: string
}) {
  // O React 19 reseta o formulário depois da ação; remontar a cada resposta
  // faz os campos reaplicarem o que veio no estado (§13).
  const [estado, acao, enviando] = useActionState(
    async (anterior: EstadoConciliacao, formData: FormData) => ({
      ...(await conciliarConta(anterior, formData)),
      chave: (anterior.chave ?? 0) + 1,
    }),
    INICIAL,
  )

  const erro = estado.erro && (
    <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
      <span aria-hidden="true">⚠ </span>
      {estado.erro}
    </p>
  )

  if (estado.etapa === 'informar') {
    return (
      <form key={estado.chave} action={acao} className="max-w-lg space-y-4">
        <input type="hidden" name="accountId" value={accountId} />
        <input type="hidden" name="etapa" value="comparar" />

        {erro}

        <div>
          <label htmlFor="saldoInformado" className="block text-sm font-medium">
            Saldo que aparece no extrato de {nomeConta}
          </label>
          <input
            id="saldoInformado" name="saldoInformado" inputMode="decimal" placeholder="0,00" required
            defaultValue={estado.reportedTexto ?? ''}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
          <p className="mt-1 text-xs text-slate-500">
            Nada é alterado agora. Você vê a diferença e decide o que fazer.
          </p>
        </div>

        <button
          type="submit" disabled={enviando}
          className="rounded bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {enviando ? 'Comparando…' : 'Comparar'}
        </button>
      </form>
    )
  }

  return (
    <form key={estado.chave} action={acao} className="max-w-lg space-y-5">
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="etapa" value="confirmar" />
      <input type="hidden" name="saldoInformado" value={estado.reportedTexto ?? ''} />

      {erro}

      <dl className="grid grid-cols-2 gap-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <dt className="text-slate-600">Extrato</dt>
        <dd className="text-right tabular-nums">{dinheiro(cents(estado.reportedCents ?? 0))}</dd>

        <dt className="text-slate-600">Sistema</dt>
        <dd className="text-right tabular-nums">{dinheiro(cents(estado.calculatedCents ?? 0))}</dd>

        <dt className="border-t border-slate-200 pt-2 font-medium">Diferença</dt>
        <dd className="border-t border-slate-200 pt-2 text-right font-medium tabular-nums">
          {dinheiro(cents(estado.differenceCents ?? 0))}
        </dd>
      </dl>

      {estado.confere ? (
        <>
          <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <span aria-hidden="true">✓ </span>
            Os valores batem. A conta será marcada como conciliada.
          </p>
          <input type="hidden" name="decisao" value="adiado" />
        </>
      ) : (
        <>
          <p className="text-sm text-slate-700">
            {(estado.differenceCents ?? 0) > 0
              ? 'O extrato tem mais do que o sistema: provavelmente falta registrar uma entrada.'
              : 'O sistema tem mais do que o extrato: provavelmente há um lançamento a mais ou repetido.'}
          </p>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">O que você quer fazer?</legend>
            {(estado.decisoes ?? []).map((decisao) => (
              <label key={decisao} className="flex items-start gap-2 rounded border border-slate-200 p-3 text-sm">
                <input
                  type="radio" name="decisao" value={decisao} required className="mt-1"
                  defaultChecked={estado.decisao === decisao}
                />
                <span>
                  <span className="font-medium">{ROTULOS[decisao].titulo}</span>
                  <span className="block text-xs text-slate-600">{ROTULOS[decisao].ajuda}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div>
            <label htmlFor="motivo" className="block text-sm font-medium">
              Motivo <span className="text-slate-500">(obrigatório se escolher criar ajuste)</span>
            </label>
            <input
              id="motivo" name="motivo" defaultValue={estado.motivo ?? ''}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </div>
        </>
      )}

      <button
        type="submit" disabled={enviando}
        className="rounded bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-60"
      >
        {enviando ? 'Registrando…' : 'Confirmar conciliação'}
      </button>
    </form>
  )
}
