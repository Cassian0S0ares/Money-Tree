'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  alterarLimite,
  criarOrcamento,
  definirAcumulacao,
  removerOrcamento,
} from '../../../data/budgets'
import { registrarEvento } from '../../../data/audit'
import { exigirUsuario } from '../../../lib/session'
import { log } from '../../../lib/logger'
import { isoDate } from '../../../domain/dates'
import { parseBRL } from '../../../domain/money'

const Formulario = z.object({
  categoriaId: z.string().uuid(),
  orcamentoId: z.string().uuid().optional().or(z.literal('')),
  valor: z.string().min(1, 'Informe o limite'),
  aPartirDe: z.string().min(1),
  rollover: z.string().optional(),
  rolloverAntes: z.string().optional(),
})

export interface EstadoLimite {
  erro?: string
  sucesso?: boolean
  valores?: Record<string, string>
  chave?: number
}

/**
 * Define ou muda o limite de uma categoria a partir de um período. Mudar
 * nunca altera os períodos anteriores (spec da fatia 3, seção 4.2).
 */
export async function definirLimite(_anterior: EstadoLimite, formData: FormData): Promise<EstadoLimite> {
  const usuario = await exigirUsuario()
  const bruto = Object.fromEntries(formData) as Record<string, string>
  const analise = Formulario.safeParse(bruto)
  if (!analise.success) return { erro: analise.error.issues[0].message, valores: bruto }
  const d = analise.data

  let orcamentoId = d.orcamentoId || null
  try {
    const valor = parseBRL(d.valor)
    if (valor < 0) return { erro: 'O limite não pode ser negativo', valores: bruto }
    const aPartirDe = isoDate(d.aPartirDe)
    const rollover = d.rollover === 'on'

    if (orcamentoId) {
      await alterarLimite(usuario.id, orcamentoId, valor, aPartirDe)
      if (rollover !== (d.rolloverAntes === 'on')) {
        await definirAcumulacao(usuario.id, orcamentoId, rollover, aPartirDe)
        await registrarEvento(usuario.id, {
          eventType: 'orcamento.acumulacao_alterada', objectType: 'budget', objectId: orcamentoId,
          source: 'usuario', result: 'sucesso',
        })
      }
    } else {
      const criado = await criarOrcamento(usuario.id, {
        categoryId: d.categoriaId, amountCents: valor, aPartirDe, rollover,
      })
      orcamentoId = criado.id
    }
  } catch (erro) {
    if (erro instanceof Error && ['ValorInvalidoError', 'DataInvalidaError'].includes(erro.name)) {
      return { erro: erro.message, valores: bruto }
    }
    log.error('orcamento.falhou', { codigo: (erro as { code?: string })?.code })
    return { erro: 'Não foi possível salvar o limite. Nada foi gravado; tente de novo.', valores: bruto }
  }

  await registrarEvento(usuario.id, {
    eventType: d.orcamentoId ? 'orcamento.limite_alterado' : 'orcamento.criado',
    objectType: 'budget', objectId: orcamentoId!, source: 'usuario', result: 'sucesso',
  })
  revalidatePath('/orcamentos')
  revalidatePath('/')
  return { sucesso: true }
}

export async function removerOrcamentoAcao(formData: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  const id = String(formData.get('id'))

  await removerOrcamento(usuario.id, id)
  await registrarEvento(usuario.id, {
    eventType: 'orcamento.removido', objectType: 'budget', objectId: id,
    source: 'usuario', result: 'sucesso',
  })
  revalidatePath('/orcamentos')
  revalidatePath('/')
}
