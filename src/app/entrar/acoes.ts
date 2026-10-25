'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { verificarSenha } from '../../data/users'
import { abrirSessao, encerrarSessao } from '../../data/sessions'
import { registrarEvento } from '../../data/audit'
import { definirCookieSessao, lerCookieSessao, limparCookieSessao } from '../../lib/session'
import { registrarTentativa, verificarLimite } from '../../lib/rate-limit'
import { log } from '../../lib/logger'

const Entrada = z.object({
  email: z.string().email('Informe um e-mail válido'),
  senha: z.string().min(1, 'Informe a senha'),
})

const MAX_FALHAS_ORIGEM = 20

export interface EstadoEntrar {
  erro?: string
  /** Preservado para que o formulário não perca o que foi digitado (§13). */
  email?: string
}

export async function entrar(
  _anterior: EstadoEntrar,
  formData: FormData,
): Promise<EstadoEntrar> {
  const bruto = {
    email: String(formData.get('email') ?? ''),
    senha: String(formData.get('senha') ?? ''),
  }

  const analise = Entrada.safeParse(bruto)
  if (!analise.success) {
    return { erro: analise.error.issues[0].message, email: bruto.email }
  }

  // Dois contadores (ameaça T2). Por conta, 5 falhas: protege a senha de
  // uma pessoa. Por origem, 20: barra quem testa uma senha comum contra
  // muitos e-mails, que nunca bateria no limite de cada conta. O teto da
  // origem é maior porque várias pessoas podem compartilhar um IP.
  const cabecalhos = await headers()
  const ip = cabecalhos.get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconhecido'
  const chaveConta = analise.data.email.toLowerCase()
  const chaveOrigem = `ip:${ip}`

  const limite = [verificarLimite(chaveConta), verificarLimite(chaveOrigem, MAX_FALHAS_ORIGEM)].find(
    (resultado) => !resultado.permitido,
  )
  if (limite) {
    return {
      erro: `Muitas tentativas. Tente de novo em ${Math.ceil(limite.esperarSegundos / 60)} minutos.`,
      email: bruto.email,
    }
  }

  const usuario = await verificarSenha(analise.data.email, analise.data.senha)
  registrarTentativa(chaveConta, usuario !== null)
  // Sucesso não zera a origem: quem tem uma conta válida limparia o próprio
  // rastro entre tentativas contra as contas dos outros.
  if (!usuario) registrarTentativa(chaveOrigem, false)

  if (!usuario) {
    // Mensagem única: dizer "e-mail não cadastrado" entrega quais contas
    // existem. O log também não registra o e-mail (§11).
    log.warn('login.falhou')
    return { erro: 'E-mail ou senha incorretos.', email: bruto.email }
  }

  // Rotação: o token que já estava no navegador morre aqui. Sem isso, um
  // token plantado antes do login (fixação de sessão) continuaria válido.
  const anterior = await lerCookieSessao()
  if (anterior) await encerrarSessao(anterior)

  const { token, expiraEm } = await abrirSessao(usuario.id, {
    userAgent: cabecalhos.get('user-agent') ?? undefined,
    ip,
  })

  await definirCookieSessao(token, expiraEm)
  await registrarEvento(usuario.id, {
    eventType: 'sessao.aberta',
    source: 'usuario',
    result: 'sucesso',
  })

  redirect('/')
}

export async function sair(): Promise<void> {
  const token = await lerCookieSessao()
  if (token) await encerrarSessao(token)
  await limparCookieSessao()
  redirect('/entrar')
}
