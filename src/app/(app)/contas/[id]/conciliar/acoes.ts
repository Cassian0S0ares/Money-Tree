'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prepararConciliacao, registrarConciliacao } from '../../../../../data/reconciliations'
import { registrarEvento } from '../../../../../data/audit'
import { exigirUsuario } from '../../../../../lib/session'
import { log } from '../../../../../lib/logger'
import { hojeEm } from '../../../../../domain/dates'
import { parseBRL } from '../../../../../domain/money'
import type { DecisaoConciliacao } from '../../../../../domain/reconciliation'

export interface EstadoConciliacao {
  etapa: 'informar' | 'decidir'
  erro?: string
  reportedTexto?: string
  reportedCents?: number
  calculatedCents?: number
  differenceCents?: number
  confere?: boolean
  decisoes?: DecisaoConciliacao[]
  /** O que foi escolhido e digitado, para sobreviver a uma recusa (§13). */
  decisao?: string
  motivo?: string
  /** Incrementada no cliente a cada resposta, para remontar o formulário. */
  chave?: number
}

const DECISOES: ReadonlySet<string> = new Set<DecisaoConciliacao>([
  'lancamento_localizado',
  'duplicidade_removida',
  'ajuste_criado',
  'adiado',
])

/**
 * As duas etapas passam pela mesma ação, para que uma recusa na segunda
 * (ajuste sem motivo, por exemplo) volte à tela de decisão com a diferença
 * ainda visível, em vez de virar página de erro.
 */
export async function conciliarConta(
  anterior: EstadoConciliacao,
  formData: FormData,
): Promise<EstadoConciliacao> {
  return formData.get('etapa') === 'confirmar'
    ? confirmar(anterior, formData)
    : comparar(formData)
}

/** Etapa 1: calcula e mostra. Nada é gravado (§5.3.1). */
async function comparar(formData: FormData): Promise<EstadoConciliacao> {
  const usuario = await exigirUsuario()
  const accountId = String(formData.get('accountId'))
  const texto = String(formData.get('saldoInformado') ?? '')

  let reportedCents
  try {
    reportedCents = parseBRL(texto)
  } catch {
    return { etapa: 'informar', erro: 'Informe o saldo no formato 1.234,56', reportedTexto: texto }
  }

  const previa = await prepararConciliacao(usuario.id, accountId, reportedCents)

  return {
    etapa: 'decidir',
    reportedTexto: texto,
    reportedCents,
    calculatedCents: previa.calculatedCents,
    differenceCents: previa.differenceCents,
    confere: previa.confere,
    decisoes: previa.decisoesPossiveis,
  }
}

/** Etapa 2: grava a decisão do usuário. */
async function confirmar(
  anterior: EstadoConciliacao,
  formData: FormData,
): Promise<EstadoConciliacao> {
  const usuario = await exigirUsuario()
  const accountId = String(formData.get('accountId'))
  const decisao = String(formData.get('decisao') ?? '')
  const motivo = String(formData.get('motivo') ?? '').trim()

  const preservado = { ...anterior, decisao, motivo }

  if (!DECISOES.has(decisao)) {
    return { ...preservado, erro: 'Escolha o que fazer com a diferença.' }
  }
  if (decisao === 'ajuste_criado' && !motivo) {
    return {
      ...preservado,
      erro: 'Ajuste exige motivo: sem ele, o histórico muda sem explicação.',
    }
  }

  try {
    await registrarConciliacao(usuario.id, {
      accountId,
      reportedCents: parseBRL(String(formData.get('saldoInformado'))),
      decision: decisao as DecisaoConciliacao,
      motivo: motivo || undefined,
      quando: hojeEm(usuario.timezone),
    })
  } catch (erro) {
    log.error('conciliacao.falhou', { codigo: (erro as { code?: string })?.code })
    return {
      ...preservado,
      erro: 'Não foi possível registrar a conciliação. Nada foi gravado; tente de novo.',
    }
  }

  await registrarEvento(usuario.id, {
    eventType: 'conta.conciliada',
    objectType: 'account',
    objectId: accountId,
    source: 'usuario',
    result: 'sucesso',
  })

  revalidatePath('/contas')
  revalidatePath('/')
  redirect('/contas')
}
