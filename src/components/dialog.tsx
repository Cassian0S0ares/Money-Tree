'use client'

import { useEffect, useId, useRef } from 'react'
import { classesBotao } from './ui'

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
  // Ids únicos: a mesma página pode ter vários diálogos (um por linha).
  const id = useId()

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
      aria-labelledby={`${id}-titulo`}
      aria-describedby={`${id}-descricao`}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-slate-200 p-0 shadow-xl backdrop:bg-slate-900/50"
    >
      <div className="p-6">
        <h2 id={`${id}-titulo`} className="text-lg font-semibold text-slate-900">
          {titulo}
        </h2>
        <p id={`${id}-descricao`} className="mt-2 text-sm text-slate-600">
          {descricao}
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          {/* Cancelar vem primeiro e recebe o foco: o caminho seguro é o padrão. */}
          <button type="button" autoFocus onClick={aoCancelar} className={classesBotao('secundario')}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={aoConfirmar}
            className={classesBotao(perigoso ? 'perigo' : 'primario')}
          >
            {rotuloConfirmar}
          </button>
        </div>
      </div>
    </dialog>
  )
}
