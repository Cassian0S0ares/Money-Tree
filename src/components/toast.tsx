'use client'

import { useEffect, useState } from 'react'

/**
 * Aviso curto com desfazer (§15). `role="status"` faz o leitor de tela
 * anunciar sem roubar o foco de onde a pessoa está. Passar o mouse ou o
 * foco por cima segura o relógio: oito segundos não bastam para todo mundo.
 */
export function ToastDesfazer({
  mensagem,
  aoDesfazer,
  segundos = 8,
}: {
  mensagem: string
  aoDesfazer?: () => void
  segundos?: number
}) {
  const [visivel, setVisivel] = useState(true)
  const [pausado, setPausado] = useState(false)

  useEffect(() => {
    if (pausado) return
    const relogio = setTimeout(() => setVisivel(false), segundos * 1000)
    return () => clearTimeout(relogio)
  }, [segundos, pausado])

  if (!visivel) return null

  return (
    <div
      role="status"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={() => setPausado(false)}
      className="fixed bottom-6 left-1/2 z-20 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 animate-[subir_200ms_ease-out] items-center justify-between gap-4 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl"
    >
      <span>
        <span aria-hidden="true" className="mr-2 text-marca-100">✓</span>
        {mensagem}
      </span>
      <div className="flex items-center gap-1">
        {aoDesfazer && (
          <button
            type="button"
            onClick={() => {
              aoDesfazer()
              setVisivel(false)
            }}
            className="min-h-10 rounded-lg px-3 font-semibold text-marca-100 hover:bg-white/10"
          >
            Desfazer
          </button>
        )}
        <button
          type="button"
          onClick={() => setVisivel(false)}
          aria-label="Fechar aviso"
          className="min-h-10 rounded-lg px-3 text-slate-300 hover:bg-white/10 hover:text-white"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </div>
  )
}
