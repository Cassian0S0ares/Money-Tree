'use client'

import { useActionState } from 'react'
import { conciliarConta, type EstadoConciliacao } from './acoes'
import { cents } from '../../../../../domain/money'
import { Aviso, Cartao, Dica, Rotulo, Valor, classeEntrada, classesBotao } from '../../../../../components/ui'

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

function Etapa({ numero, titulo }: { numero: 1 | 2; titulo: string }) {
  return (
    <p className="text-sm font-medium text-marca-700">
      Etapa {numero} de 2 <span aria-hidden="true">·</span> <span className="text-slate-900">{titulo}</span>
    </p>
  )
}

export function FormularioConciliacao({
  accountId,
  nomeConta,
}: {
  accountId: string
  nomeConta: string
}) {
  // O React 19 reseta o formulário depois da ação; remontar a cada resposta
  // faz os campos reaplicarem o que veio no estado (§13). "Voltar" não vai ao
  // servidor: só devolve a primeira etapa com o valor que já foi digitado.
  const [estado, acao, enviando] = useActionState(
    async (anterior: EstadoConciliacao, formData: FormData): Promise<EstadoConciliacao> => {
      const proximo: EstadoConciliacao =
        formData.getAll('etapa').includes('voltar')
          ? { etapa: 'informar', reportedTexto: anterior.reportedTexto }
          : await conciliarConta(anterior, formData)
      return { ...proximo, chave: (anterior.chave ?? 0) + 1 }
    },
    INICIAL,
  )

  const erro = estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>

  if (estado.etapa === 'informar') {
    return (
      <Cartao className="max-w-xl p-6">
        <form key={estado.chave} action={acao} className="space-y-5">
          <Etapa numero={1} titulo="Informe o saldo do extrato" />
          <input type="hidden" name="accountId" value={accountId} />
          <input type="hidden" name="etapa" value="comparar" />

          {erro}

          <div>
            <Rotulo htmlFor="saldoInformado">Saldo que aparece no extrato de {nomeConta}</Rotulo>
            <div className="relative">
              <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 mt-0.5 -translate-y-1/2 text-sm text-slate-500">
                R$
              </span>
              <input
                id="saldoInformado" name="saldoInformado" inputMode="decimal" placeholder="0,00" required
                aria-describedby="saldoInformado-dica"
                aria-invalid={estado.erro ? true : undefined}
                defaultValue={estado.reportedTexto ?? ''}
                className={`${classeEntrada} pl-10 text-lg font-medium tabular-nums`}
              />
            </div>
            <Dica id="saldoInformado-dica">
              Nada é alterado agora. Você vê a diferença e decide o que fazer.
            </Dica>
          </div>

          <button type="submit" disabled={enviando} className={classesBotao('primario')}>
            {enviando ? 'Comparando…' : 'Comparar com o sistema'}
          </button>
        </form>
      </Cartao>
    )
  }

  const diferenca = estado.differenceCents ?? 0

  return (
    <Cartao className="max-w-xl p-6">
      <form key={estado.chave} action={acao} className="space-y-6">
        <Etapa numero={2} titulo={estado.confere ? 'Confirme' : 'Decida o que fazer'} />
        <input type="hidden" name="accountId" value={accountId} />
        <input type="hidden" name="etapa" value="confirmar" />
        <input type="hidden" name="saldoInformado" value={estado.reportedTexto ?? ''} />

        {erro}

        <dl className="grid grid-cols-[1fr_auto] gap-y-2 rounded-lg bg-slate-50 p-4 text-sm">
          <dt className="text-slate-600">Extrato</dt>
          <dd className="text-right"><Valor centavos={cents(estado.reportedCents ?? 0)} /></dd>

          <dt className="text-slate-600">Sistema</dt>
          <dd className="text-right"><Valor centavos={cents(estado.calculatedCents ?? 0)} /></dd>

          <dt className="border-t border-slate-200 pt-2 font-semibold text-slate-900">Diferença</dt>
          <dd className="border-t border-slate-200 pt-2 text-right font-semibold">
            <Valor centavos={cents(diferenca)} />
          </dd>
        </dl>

        {estado.confere ? (
          <>
            <Aviso tipo="sucesso">Os valores batem. A conta será marcada como conciliada.</Aviso>
            <input type="hidden" name="decisao" value="adiado" />
          </>
        ) : (
          <>
            <p className="text-sm text-slate-700">
              {diferenca > 0
                ? 'O extrato tem mais do que o sistema: provavelmente falta registrar uma entrada.'
                : 'O sistema tem mais do que o extrato: provavelmente há um lançamento a mais ou repetido.'}
            </p>

            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium text-slate-800">O que você quer fazer?</legend>
              {(estado.decisoes ?? []).map((decisao) => (
                <label
                  key={decisao}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm hover:bg-slate-50 has-[:checked]:border-marca-700 has-[:checked]:bg-marca-50"
                >
                  <input
                    type="radio" name="decisao" value={decisao} required
                    className="mt-0.5 size-4 accent-marca-700"
                    defaultChecked={estado.decisao === decisao}
                  />
                  <span>
                    <span className="font-medium text-slate-900">{ROTULOS[decisao].titulo}</span>
                    <span className="mt-0.5 block text-xs text-slate-600">{ROTULOS[decisao].ajuda}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <div>
              <Rotulo htmlFor="motivo">Motivo</Rotulo>
              <input
                id="motivo" name="motivo" defaultValue={estado.motivo ?? ''}
                aria-describedby="motivo-dica"
                aria-invalid={estado.erro && estado.decisao === 'ajuste_criado' ? true : undefined}
                placeholder="Ex.: tarifa do mês não lançada"
                className={classeEntrada}
              />
              <Dica id="motivo-dica">Obrigatório se escolher criar ajuste.</Dica>
            </div>
          </>
        )}

        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={enviando} className={classesBotao('primario')}>
            {enviando ? 'Registrando…' : 'Confirmar conciliação'}
          </button>
          <button
            type="submit" name="etapa" value="voltar" formNoValidate
            className={classesBotao('fantasma')}
          >
            Corrigir o saldo informado
          </button>
        </div>
      </form>
    </Cartao>
  )
}
