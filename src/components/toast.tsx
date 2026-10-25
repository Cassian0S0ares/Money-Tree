'use client'

import { useEffect, useState } from 'react'

/**
 * Aviso curto com desfazer (§15). `role="status"` faz o leitor de tela
 * anunciar sem roubar o foco de onde a pessoa está.
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

  useEffect(() => {
    const relogio = setTimeout(() => setVisivel(false), segundos * 1000)
    return () => clearTimeout(relogio)
  }, [segundos])

  if (!visivel) return null

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-lg"
    >
      <span>{mensagem}</span>
      {aoDesfazer && (
        <button
          type="button"
          onClick={() => {
            aoDesfazer()
            setVisivel(false)
          }}
          className="font-medium underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Desfazer
        </button>
      )}
    </div>
  )
}
