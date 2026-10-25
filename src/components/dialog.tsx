'use client'

import { useEffect, useRef } from 'react'

/**
 * Substitui `confirm()`, que o §13 proíbe: o diálogo nativo não é
 * estilizável, não é traduzível e trava a página inteira. O `<dialog>` do
 * HTML já prende o foco e fecha no Esc.
 */
export function DialogConfirmacao({
  aberto,
  titulo,
  descricao,
  rotuloConfirmar = 'Confirmar',
  perigoso = false,
  aoConfirmar,
  aoCancelar,
}: {
  aberto: boolean
  titulo: string
  descricao: string
  rotuloConfirmar?: string
  perigoso?: boolean
  aoConfirmar: () => void
  aoCancelar: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialogo = ref.current
    if (!dialogo) return
    if (aberto && !dialogo.open) dialogo.showModal()
    if (!aberto && dialogo.open) dialogo.close()
  }, [aberto])

  return (
    <dialog
      ref={ref}
      onCancel={(evento) => {
        evento.preventDefault()
        aoCancelar()
      }}
      aria-labelledby="dialogo-titulo"
      aria-describedby="dialogo-descricao"
      className="rounded-lg border border-slate-200 p-0 backdrop:bg-slate-900/40"
    >
      <div className="max-w-md p-6">
        <h2 id="dialogo-titulo" className="text-lg font-semibold text-slate-900">
          {titulo}
        </h2>
        <p id="dialogo-descricao" className="mt-2 text-sm text-slate-600">
          {descricao}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={aoCancelar}
            className="rounded border border-slate-300 px-4 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={aoConfirmar}
            className={`rounded px-4 py-2 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
              perigoso ? 'bg-red-700 hover:bg-red-800' : 'bg-slate-900 hover:bg-slate-800'
            }`}
          >
            {rotuloConfirmar}
          </button>
        </div>
      </div>
    </dialog>
  )
}
