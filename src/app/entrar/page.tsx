'use client'

import { useActionState } from 'react'
import { entrar, type EstadoEntrar } from './acoes'

const INICIAL: EstadoEntrar = {}

export default function PaginaEntrar() {
  const [estado, acao, enviando] = useActionState(entrar, INICIAL)

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold">Money Tree</h1>
      <p className="mt-1 text-sm text-slate-600">Entre para ver suas contas.</p>

      <form action={acao} className="mt-8 space-y-4">
        {estado.erro && (
          <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <span aria-hidden="true">⚠ </span>
            {estado.erro}
          </p>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            defaultValue={estado.email ?? ''}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          />
        </div>

        <div>
          <label htmlFor="senha" className="block text-sm font-medium">
            Senha
          </label>
          <input
            id="senha"
            name="senha"
            type="password"
            autoComplete="current-password"
            required
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          />
        </div>

        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
