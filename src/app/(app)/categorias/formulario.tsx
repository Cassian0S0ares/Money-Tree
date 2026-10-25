'use client'

import { useActionState } from 'react'
import { salvarCategoria, type EstadoFormularioCategoria } from './acoes'
import type { Categoria } from '../../../data/categories'

const INICIAL: EstadoFormularioCategoria = {}

export function FormularioCategoria({ raizes }: { raizes: Categoria[] }) {
  // O React 19 reseta o formulário depois da ação, e <select> não volta ao
  // defaultValue. Remontar a cada resposta faz todo campo reaplicar o que o
  // usuário tinha digitado (§13).
  const [estado, acao, enviando] = useActionState(
    async (anterior: EstadoFormularioCategoria, formData: FormData) => ({
      ...(await salvarCategoria(anterior, formData)),
      chave: (anterior.chave ?? 0) + 1,
    }),
    INICIAL,
  )
  const v = estado.valores ?? {}

  return (
    <form key={estado.chave} action={acao} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
      {estado.erro && (
        <p role="alert" className="w-full rounded border border-red-200 bg-red-50 p-2 text-sm text-red-900">
          <span aria-hidden="true">⚠ </span>
          {estado.erro}
        </p>
      )}

      <div className="grow">
        <label htmlFor="name" className="block text-sm font-medium">Nome</label>
        <input
          id="name" name="name" required defaultValue={v.name ?? ''}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        />
      </div>

      <div>
        <label htmlFor="kind" className="block text-sm font-medium">Tipo</label>
        <select
          id="kind" name="kind" defaultValue={v.kind ?? 'despesa'}
          className="mt-1 rounded border border-slate-300 px-3 py-2"
        >
          <option value="despesa">Despesa</option>
          <option value="receita">Receita</option>
        </select>
      </div>

      <div>
        <label htmlFor="parentId" className="block text-sm font-medium">
          Dentro de <span className="text-slate-500">(opcional)</span>
        </label>
        <select
          id="parentId" name="parentId" defaultValue={v.parentId ?? ''}
          className="mt-1 rounded border border-slate-300 px-3 py-2"
        >
          <option value="">Nenhuma</option>
          {raizes.map((raiz) => (
            <option key={raiz.id} value={raiz.id}>{raiz.name}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">Subcategoria usa o tipo do grupo.</p>
      </div>

      <button
        type="submit" disabled={enviando}
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {enviando ? 'Salvando…' : 'Adicionar'}
      </button>
    </form>
  )
}
