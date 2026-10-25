'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import {
  apagarLancamentoPrevisto,
  atualizarStatus,
  criarLancamento,
  criarTransferencia,
  estornarLancamento,
} from '../../../data/transactions'
import { registrarEvento } from '../../../data/audit'
import { exigirUsuario } from '../../../lib/session'
import { isoDate } from '../../../domain/dates'
import { parseBRL } from '../../../domain/money'
import { LancamentoInvalidoError } from '../../../domain/transaction'
import { log } from '../../../lib/logger'

const Formulario = z.object({
  kind: z.enum(['receita', 'despesa', 'transferencia', 'ajuste']),
  description: z.string().trim().min(1, 'Informe uma descrição'),
  valor: z.string().min(1, 'Informe o valor'),
  competenceDate: z.string().min(1, 'Informe a data'),
  status: z.enum(['previsto', 'pendente', 'liquidado']),
  settledDate: z.string().optional(),
  accountId: z.string().uuid('Escolha a conta').optional(),
  toAccountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional().or(z.literal('')),
  nature: z.enum(['fixa', 'variavel']).optional(),
  counterparty: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  adjustmentReason: z.string().trim().optional(),
  direcaoAjuste: z.enum(['1', '-1']).optional(),
})

export interface EstadoFormularioLancamento {
  erro?: string
  campoInvalido?: string
  valores?: Record<string, string>
  criadoId?: string
  podeDesfazer?: boolean
  /** Incrementada no cliente a cada resposta, para remontar o formulário. */
  chave?: number
}

export async function salvarLancamento(
  _anterior: EstadoFormularioLancamento,
  formData: FormData,
): Promise<EstadoFormularioLancamento> {
  const usuario = await exigirUsuario()
  const bruto = Object.fromEntries(formData) as Record<string, string>

  const analise = Formulario.safeParse(bruto)
  if (!analise.success) {
    const problema = analise.error.issues[0]
    return { erro: problema.message, campoInvalido: String(problema.path[0]), valores: bruto }
  }
  const d = analise.data

  let amountCents
  let competenceDate
  let settledDate = null
  try {
    amountCents = parseBRL(d.valor)
    competenceDate = isoDate(d.competenceDate)
    if (d.status === 'liquidado') {
      settledDate = isoDate(d.settledDate || d.competenceDate)
    }
  } catch (erro) {
    return {
      erro: erro instanceof Error ? erro.message : 'Valor ou data inválidos',
      campoInvalido: 'valor',
      valores: bruto,
    }
  }

  if (amountCents <= 0) {
    return { erro: 'O valor precisa ser maior que zero.', campoInvalido: 'valor', valores: bruto }
  }

  if (d.kind === 'transferencia') {
    if (!d.accountId || !d.toAccountId) {
      return { erro: 'Escolha a conta de origem e a de destino.', campoInvalido: 'toAccountId', valores: bruto }
    }
    if (d.accountId === d.toAccountId) {
      return { erro: 'Origem e destino precisam ser contas diferentes.', campoInvalido: 'toAccountId', valores: bruto }
    }

    try {
      await criarTransferencia(usuario.id, {
        fromAccountId: d.accountId,
        toAccountId: d.toAccountId,
        amountCents,
        description: d.description,
        competenceDate,
        settledDate,
        status: d.status,
        notes: d.notes || null,
      })

      await registrarEvento(usuario.id, {
        eventType: 'transferencia.criada', objectType: 'transaction',
        source: 'usuario', result: 'sucesso',
      })

    } catch (erro) {
      return { erro: mensagemDeErro(erro), valores: bruto }
    }

    revalidatePath('/lancamentos')
    revalidatePath('/')
    // Fora do try: redirect() funciona lançando uma exceção, e o catch a
    // transformaria em mensagem de erro na tela.
    redirect('/lancamentos')
  }

  if (!d.accountId) {
    return { erro: 'Escolha a conta.', campoInvalido: 'accountId', valores: bruto }
  }

  try {
    const lancamento = await criarLancamento(usuario.id, {
      accountId: d.accountId,
      categoryId: d.kind === 'ajuste' ? null : d.categoryId || null,
      kind: d.kind,
      nature: d.kind === 'receita' || d.kind === 'despesa' ? (d.nature ?? 'variavel') : null,
      description: d.description,
      counterparty: d.counterparty || null,
      notes: d.notes || null,
      amountCents,
      direction: d.kind === 'ajuste' ? (d.direcaoAjuste === '-1' ? -1 : 1) : undefined,
      status: d.status,
      competenceDate,
      settledDate,
      adjustmentReason: d.kind === 'ajuste' ? d.adjustmentReason || null : null,
    })

    await registrarEvento(usuario.id, {
      eventType: 'lancamento.criado', objectType: 'transaction', objectId: lancamento.id,
      source: 'usuario', result: 'sucesso',
    })

    revalidatePath('/lancamentos')
    revalidatePath('/')

    // Desfazer só existe enquanto o lançamento não moveu saldo. Depois de
    // liquidado, a correção é estorno (§5.3).
    return {
      criadoId: lancamento.id,
      podeDesfazer: lancamento.status === 'previsto' || lancamento.status === 'pendente',
    }
  } catch (erro) {
    return { erro: mensagemDeErro(erro), valores: bruto }
  }
}

/**
 * Mensagem do domínio é escrita para a pessoa e pode ir para a tela. Erro
 * do banco traz nome de constraint e detalhe interno: vai para o log, sem
 * dado financeiro (§11), e a tela recebe uma frase genérica.
 */
function mensagemDeErro(erro: unknown): string {
  if (erro instanceof LancamentoInvalidoError) return erro.message
  log.error('lancamento.falhou', { codigo: (erro as { code?: string })?.code })
  return 'Não foi possível salvar o lançamento. Nada foi gravado; confira os campos e tente de novo.'
}

export async function desfazer(formData: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  const id = String(formData.get('id'))

  await apagarLancamentoPrevisto(usuario.id, id)
  await registrarEvento(usuario.id, {
    eventType: 'lancamento.desfeito', objectType: 'transaction', objectId: id,
    source: 'usuario', result: 'sucesso',
  })

  revalidatePath('/lancamentos')
  revalidatePath('/')
}

export async function estornar(formData: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  const id = String(formData.get('id'))
  const motivo = String(formData.get('motivo') ?? '')

  await estornarLancamento(usuario.id, id, motivo)
  await registrarEvento(usuario.id, {
    eventType: 'lancamento.estornado', objectType: 'transaction', objectId: id,
    source: 'usuario', result: 'sucesso',
  })

  revalidatePath('/lancamentos')
  revalidatePath('/')
  redirect('/lancamentos')
}

export async function marcarLiquidado(formData: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  const id = String(formData.get('id'))
  const quando = isoDate(String(formData.get('quando')))

  await atualizarStatus(usuario.id, id, 'liquidado', quando)
  await registrarEvento(usuario.id, {
    eventType: 'lancamento.liquidado', objectType: 'transaction', objectId: id,
    source: 'usuario', result: 'sucesso',
  })

  revalidatePath('/lancamentos')
  revalidatePath('/')
}
