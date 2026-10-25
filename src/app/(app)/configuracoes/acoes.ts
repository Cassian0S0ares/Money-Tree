'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { atualizarPreferencias } from '../../../data/users'
import { encerrarTodasSessoes } from '../../../data/sessions'
import { registrarEvento } from '../../../data/audit'
import { redirect } from 'next/navigation'
import { exigirUsuario, limparCookieSessao } from '../../../lib/session'

/** Fuso inválido faria `hojeEm` lançar exceção em toda página. */
function fusoValido(fuso: string): boolean {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: fuso })
    return true
  } catch {
    return false
  }
}

const Preferencias = z.object({
  displayName: z.string().trim().min(1, 'Informe seu nome'),
  timezone: z.string().trim().refine(fusoValido, 'Fuso horário desconhecido'),
  monthStartDay: z.coerce.number().int().min(1, 'Entre 1 e 31').max(31, 'Entre 1 e 31'),
})

export interface EstadoPreferencias {
  erro?: string
  sucesso?: boolean
}

export async function salvarPreferencias(
  _anterior: EstadoPreferencias,
  formData: FormData,
): Promise<EstadoPreferencias> {
  const usuario = await exigirUsuario()
  const analise = Preferencias.safeParse(Object.fromEntries(formData))

  if (!analise.success) {
    return { erro: analise.error.issues[0].message }
  }

  await atualizarPreferencias(usuario.id, analise.data)
  await registrarEvento(usuario.id, {
    eventType: 'preferencias.atualizadas',
    source: 'usuario',
    result: 'sucesso',
  })

  revalidatePath('/configuracoes')
  return { sucesso: true }
}

/** Revogação de dispositivos, exigida pelo §11. */
export async function encerrarOutrasSessoes(): Promise<void> {
  const usuario = await exigirUsuario()

  await encerrarTodasSessoes(usuario.id)
  await registrarEvento(usuario.id, {
    eventType: 'sessoes.revogadas',
    source: 'usuario',
    result: 'sucesso',
  })

  await limparCookieSessao()
  redirect('/entrar')
}
