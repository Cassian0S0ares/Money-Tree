'use client'

import { useRef, useState, type ReactNode } from 'react'
import { DialogConfirmacao } from './dialog'

/**
 * Formulário de ação destrutiva ou difícil de desfazer. O envio para e abre
 * um diálogo próprio (§13: nunca `confirm()`); só depois do "sim" o
 * formulário segue para a server action. O evento de submit só dispara
 * depois da validação nativa, então campo obrigatório vazio é apontado
 * antes de o diálogo abrir.
 */
export function FormularioConfirmado({
  action,
  titulo,
  descricao,
  rotuloConfirmar,
  perigoso = false,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>
  titulo: string
  descricao: string
  rotuloConfirmar: string
  perigoso?: boolean
  className?: string
  children: ReactNode
}) {
  const formulario = useRef<HTMLFormElement>(null)
  const confirmado = useRef(false)
  const [aberto, setAberto] = useState(false)

  return (
    <>
      <form
        ref={formulario}
        action={action}
        className={className}
        onSubmit={(evento) => {
          if (confirmado.current) {
            confirmado.current = false
            return
          }
          evento.preventDefault()
          setAberto(true)
        }}
      >
        {children}
      </form>

      <DialogConfirmacao
        aberto={aberto}
        titulo={titulo}
        descricao={descricao}
        rotuloConfirmar={rotuloConfirmar}
        perigoso={perigoso}
        aoCancelar={() => setAberto(false)}
        aoConfirmar={() => {
          setAberto(false)
          confirmado.current = true
          formulario.current?.requestSubmit()
        }}
      />
    </>
  )
}
