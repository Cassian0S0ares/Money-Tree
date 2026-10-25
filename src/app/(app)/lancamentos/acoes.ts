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
import { hojeEm, isoDate } from '../../../domain/dates'
import { RegraInvalidaError, type AvisoValorIncomum } from '../../../domain/recurrence'
import {
  LimiteRecorrenciaError,
  criarRegra,
  editarDestaEmDiante,
  editarOcorrencia,
  pagarOcorrencia,
  pularOcorrencia,
} from '../../../data/recurrences'
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
  repetir: z.string().optional(),
  repeteUnit: z.enum(['dia', 'semana', 'mes', 'ano']).optional(),
  repeteInterval: z.coerce.number().int().min(1).max(366).optional(),
  repeteVezes: z.string().optional(),
  amountIsEstimate: z.string().optional(),
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

  // "Repetir" (spec da fatia 2, seção 8): a regra nasce com este lançamento
  // como primeira ocorrência, já no estado em que foi registrado.
  if (d.repetir === 'on' && d.kind !== 'ajuste') {
    if (!d.accountId) return { erro: 'Escolha a conta.', campoInvalido: 'accountId', valores: bruto }
    let regraId: string
    try {
      const regra = await criarRegra(
        usuario.id,
        {
          kind: d.kind,
          description: d.description,
          accountId: d.accountId,
          toAccountId: d.kind === 'transferencia' ? (d.toAccountId ?? null) : null,
          categoryId: d.kind === 'transferencia' ? null : d.categoryId || null,
          nature: d.kind === 'transferencia' ? null : (d.nature ?? 'fixa'),
          amountCents,
          amountIsEstimate: d.amountIsEstimate === 'on',
          unit: d.repeteUnit ?? 'mes',
          interval: d.repeteInterval ?? 1,
          startDate: competenceDate,
          maxOccurrences: d.repeteVezes ? Number(d.repeteVezes) : null,
        },
        {
          hoje: hojeEm(usuario.timezone),
          primeira: { status: d.status, settledDate },
        },
      )
      regraId = regra.id
    } catch (erro) {
      return { erro: mensagemDeErro(erro), valores: bruto }
    }

    await registrarEvento(usuario.id, {
      eventType: 'regra.criada', objectType: 'recurrence_rule', objectId: regraId,
      source: 'usuario', result: 'sucesso',
    })
    revalidatePath('/lancamentos')
    revalidatePath('/recorrencias')
    revalidatePath('/')
    redirect(`/recorrencias/${regraId}`)
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
  if (
    erro instanceof LancamentoInvalidoError ||
    erro instanceof RegraInvalidaError ||
    erro instanceof LimiteRecorrenciaError
  ) {
    return erro.message
  }
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

export interface EstadoPagamento {
  erro?: string
  pago?: boolean
  aviso?: AvisoValorIncomum | null
}

/**
 * Paga uma ocorrência com o valor real. Devolve o aviso de valor incomum em
 * vez de redirecionar: o valor fica fora da URL, longe de log de proxy (§11).
 */
export async function pagarOcorrenciaAcao(
  _anterior: EstadoPagamento,
  formData: FormData,
): Promise<EstadoPagamento> {
  const usuario = await exigirUsuario()
  const id = String(formData.get('id'))

  let resultado
  try {
    resultado = await pagarOcorrencia(usuario.id, id, {
      valor: parseBRL(String(formData.get('valor') ?? '')),
      quando: isoDate(String(formData.get('quando') ?? '')),
    })
  } catch (erro) {
    if (erro instanceof Error && ['ValorInvalidoError', 'DataInvalidaError'].includes(erro.name)) {
      return { erro: erro.message }
    }
    return { erro: mensagemDeErro(erro) }
  }

  await registrarEvento(usuario.id, {
    eventType: 'lancamento.liquidado', objectType: 'transaction', objectId: id,
    source: 'usuario', result: 'sucesso',
  })
  revalidatePath(`/lancamentos/${id}`)
  revalidatePath('/lancamentos')
  revalidatePath('/recorrencias')
  revalidatePath('/')
  return { pago: true, aviso: resultado.aviso }
}

export async function pularOcorrenciaAcao(formData: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  const id = String(formData.get('id'))

  await pularOcorrencia(usuario.id, id)
  await registrarEvento(usuario.id, {
    eventType: 'ocorrencia.pulada', objectType: 'transaction', objectId: id,
    source: 'usuario', result: 'sucesso',
  })
  revalidatePath(`/lancamentos/${id}`)
  revalidatePath('/lancamentos')
  revalidatePath('/recorrencias')
  revalidatePath('/')
}

export interface EstadoEdicaoOcorrencia {
  erro?: string
  valores?: Record<string, string>
  chave?: number
}

/**
 * Editar uma ocorrência: só esta (vira exceção) ou desta em diante (divide
 * a série). A escolha é explícita no formulário, como pede a spec.
 */
export async function editarOcorrenciaAcao(
  _anterior: EstadoEdicaoOcorrencia,
  formData: FormData,
): Promise<EstadoEdicaoOcorrencia> {
  const usuario = await exigirUsuario()
  const bruto = Object.fromEntries(formData) as Record<string, string>
  const id = bruto.id
  const escopo = bruto.escopo === 'serie' ? 'serie' : 'esta'
  let destino = `/lancamentos/${id}`

  try {
    const description = bruto.description?.trim()
    if (!description) return { erro: 'Informe uma descrição', valores: bruto }
    const amountCents = parseBRL(bruto.valor ?? '')
    const vencimento = isoDate(bruto.vencimento ?? '')

    if (escopo === 'esta') {
      await editarOcorrencia(usuario.id, id, { description, amountCents, dueDate: vencimento })
    } else {
      const atual = bruto.vencimentoOriginal
      const regra = await editarDestaEmDiante(
        usuario.id,
        id,
        {
          description,
          amountCents,
          // Data mudada vira a nova âncora da série; sem mudança, a série
          // segue o calendário que já tinha.
          ...(vencimento !== atual ? { startDate: vencimento } : {}),
        },
        hojeEm(usuario.timezone),
      )
      // A ocorrência de origem pode ter sido apagada e regerada; o lugar
      // estável para mostrar o resultado é a regra.
      destino = `/recorrencias/${regra.id}`
    }
  } catch (erro) {
    if (erro instanceof Error && ['ValorInvalidoError', 'DataInvalidaError'].includes(erro.name)) {
      return { erro: erro.message, valores: bruto }
    }
    if (erro instanceof Error && /estorno/i.test(erro.message)) {
      return { erro: 'Esta ocorrência já foi paga. Para corrigir, estorne.', valores: bruto }
    }
    return { erro: mensagemDeErro(erro), valores: bruto }
  }

  await registrarEvento(usuario.id, {
    eventType: escopo === 'serie' ? 'regra.editada' : 'ocorrencia.editada',
    objectType: 'transaction', objectId: id, source: 'usuario', result: 'sucesso',
  })
  revalidatePath('/lancamentos')
  revalidatePath('/recorrencias')
  revalidatePath('/')
  redirect(destino)
}
