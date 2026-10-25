'use client'

import { useActionState } from 'react'
import { salvarPreferencias, type EstadoPreferencias } from './acoes'
import type { Usuario } from '../../../data/users'

const FUSOS = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Belem',
  'America/Cuiaba',
  'America/Rio_Branco',
  'America/Noronha',
]

const INICIAL: EstadoPreferencias = {}

export function FormularioPreferencias({ usuario }: { usuario: Usuario }) {
  const [estado, acao, enviando] = useActionState(salvarPreferencias, INICIAL)

  // Fuso fora da lista (definido antes, ou vindo de outro lugar) continua
  // selecionável, em vez de o <select> trocá-lo em silêncio pelo primeiro.
  const fusos = FUSOS.includes(usuario.timezone) ? FUSOS : [usuario.timezone, ...FUSOS]

  return (
    <form action={acao} className="space-y-4">
      {estado.erro && (
        <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <span aria-hidden="true">⚠ </span>
          {estado.erro}
        </p>
      )}
      {estado.sucesso && (
        <p role="status" className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <span aria-hidden="true">✓ </span>
          Preferências salvas.
        </p>
      )}

      <div>
        <label htmlFor="displayName" className="block text-sm font-medium">Nome</label>
        <input
          id="displayName" name="displayName" required defaultValue={usuario.displayName}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        />
      </div>

      <div>
        <label htmlFor="timezone" className="block text-sm font-medium">Fuso horário</label>
        <select
          id="timezone" name="timezone" defaultValue={usuario.timezone}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        >
          {fusos.map((fuso) => (
            <option key={fuso} value={fuso}>{fuso}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">
          Define qual é &quot;hoje&quot; para vencimentos e lançamentos.
        </p>
      </div>

      <div>
        <label htmlFor="monthStartDay" className="block text-sm font-medium">
          Dia em que seu mês financeiro começa
        </label>
        <input
          id="monthStartDay" name="monthStartDay" type="number" min={1} max={31}
          defaultValue={usuario.monthStartDay}
          className="mt-1 w-32 rounded border border-slate-300 px-3 py-2"
        />
        <p className="mt-1 text-xs text-slate-500">
          Use o dia do salário se preferir que o período acompanhe sua renda.
        </p>
      </div>

      <button
        type="submit" disabled={enviando}
        className="rounded bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-60"
      >
        {enviando ? 'Salvando…' : 'Salvar'}
      </button>
    </form>
  )
}
