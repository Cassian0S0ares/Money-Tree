'use client'

import { useActionState, useState } from 'react'
import { registrarMovimento, type EstadoMovimento } from './acoes'
import { Aviso, Rotulo, classeEntrada, classesBotao } from '../../../components/ui'
import { dinheiro } from '../../../lib/format'
import type { Cents } from '../../../domain/types'

const INICIAL: EstadoMovimento = {}

/**
 * Reservar ou resgatar (spec 8). Mostra o não reservado da conta escolhida
 * e quanto desta meta já está nela; o limite de verdade é o do banco.
 */
export function FormularioReserva({
  metaId,
  contas,
  contaPadrao,
  hoje,
}: {
  metaId: string
  contas: { id: string; name: string; naoReservado: Cents; daMeta: Cents }[]
  contaPadrao: string
  hoje: string
}) {
  const [estado, acao, enviando] = useActionState(
    async (anterior: EstadoMovimento, formData: FormData) => ({
      ...(await registrarMovimento(anterior, formData)),
      chave: (anterior.chave ?? 0) + 1,
    }),
    INICIAL,
  )
  const v = estado.valores ?? {}
  const invalido = (campo: string) => (estado.campoInvalido === campo ? true : undefined)
  const [contaId, setContaId] = useState(v.accountId ?? contaPadrao)
  const conta = contas.find((c) => c.id === contaId)

  return (
    <form key={estado.chave} action={acao} className="space-y-4">
      <input type="hidden" name="metaId" value={metaId} />
      {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
      {estado.sucesso && <Aviso tipo="sucesso">{estado.sucesso}</Aviso>}

      <fieldset>
        <legend className="text-sm font-medium text-slate-800">Operação</legend>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <label className="flex min-h-10 items-center gap-2">
            <input type="radio" name="operacao" value="aporte" defaultChecked={(v.operacao ?? 'aporte') === 'aporte'} className="size-4 accent-marca-700" />
            Reservar
          </label>
          <label className="flex min-h-10 items-center gap-2">
            <input type="radio" name="operacao" value="resgate" defaultChecked={v.operacao === 'resgate'} className="size-4 accent-marca-700" />
            Resgatar
          </label>
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Rotulo htmlFor="mov-valor">Valor</Rotulo>
          <div className="relative">
            <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 mt-0.5 -translate-y-1/2 text-sm text-slate-500">R$</span>
            <input
              id="mov-valor" name="valor" inputMode="decimal" required placeholder="0,00"
              aria-invalid={invalido('valor')} defaultValue={v.valor ?? ''}
              className={`${classeEntrada} pl-10 text-right tabular-nums`}
            />
          </div>
        </div>
        <div>
          <Rotulo htmlFor="mov-conta">Conta</Rotulo>
          <select
            id="mov-conta" name="accountId" required aria-invalid={invalido('accountId')}
            aria-describedby="mov-conta-dica"
            value={contaId} onChange={(e) => setContaId(e.target.value)} className={classeEntrada}
          >
            <option value="">Escolha…</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <Rotulo htmlFor="mov-data">Data</Rotulo>
          <input
            id="mov-data" name="data" type="date" required aria-invalid={invalido('data')}
            defaultValue={v.data ?? hoje} className={classeEntrada}
          />
        </div>
      </div>

      <p id="mov-conta-dica" aria-live="polite" className="text-sm text-slate-700">
        {conta
          ? `Sem reserva nesta conta: ${dinheiro(Math.max(0, conta.naoReservado) as Cents)} · Desta meta nesta conta: ${dinheiro(conta.daMeta)}`
          : 'Escolha a conta para ver quanto dela está sem reserva.'}
      </p>

      <p className="text-xs text-slate-600">
        Reservar não move dinheiro entre contas. Se quiser o dinheiro numa conta separada, registre também a transferência.
      </p>

      <button type="submit" disabled={enviando} className={classesBotao('primario')}>
        {enviando ? 'Registrando…' : 'Registrar'}
      </button>
    </form>
  )
}
