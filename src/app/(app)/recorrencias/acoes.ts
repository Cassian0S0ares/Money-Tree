'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import {
  LimiteRecorrenciaError,
  criarRegra,
  encerrarRegra,
  pausarRegra,
  retomarRegra,
  type NovaRegra,
} from '../../../data/recurrences'
import { registrarEvento } from '../../../data/audit'
import { exigirUsuario } from '../../../lib/session'
import { log } from '../../../lib/logger'
import { hojeEm, isoDate } from '../../../domain/dates'
import { parseBRL } from '../../../domain/money'
import { RegraInvalidaError } from '../../../domain/recurrence'

const uuidOuVazio = z.string().uuid().optional().or(z.literal(''))

const Formulario = z.object({
  kind: z.enum(['despesa', 'receita', 'transferencia']),
  description: z.string().trim().min(1, 'Informe uma descrição'),
  valor: z.string().min(1, 'Informe o valor'),
  amountIsEstimate: z.string().optional(),
  accountId: z.string().uuid('Escolha a conta'),
  toAccountId: uuidOuVazio,
  categoryId: uuidOuVazio,
  unit: z.enum(['dia', 'semana', 'mes', 'ano']),
  interval: z.coerce.number().int('O intervalo precisa ser inteiro').min(1, 'O intervalo mínimo é 1').max(366),
  startDate: z.string().min(1, 'Informe a primeira data'),
  fim: z.enum(['nunca', 'data', 'vezes']),
  endDate: z.string().optional(),
  maxOccurrences: z.string().optional(),
  weekendPolicy: z.enum(['manter', 'proximo_dia_util']),
})

export interface EstadoFormularioRegra {
  erro?: string
  campoInvalido?: string
  valores?: Record<string, string>
  /** Incrementada no cliente a cada resposta, para remontar o formulário. */
  chave?: number
}

/** Erro que pode ir para a tela: escrito para a pessoa, sem detalhe interno. */
function mensagem(erro: unknown): string {
  if (erro instanceof RegraInvalidaError || erro instanceof LimiteRecorrenciaError) return erro.message
  if (erro instanceof Error && erro.name === 'ValorInvalidoError') return erro.message
  if (erro instanceof Error && erro.name === 'DataInvalidaError') return 'Confira as datas informadas.'
  log.error('recorrencia.falhou', { codigo: (erro as { code?: string })?.code })
  return 'Não foi possível salvar a recorrência. Nada foi gravado; confira os campos e tente de novo.'
}

export async function salvarRegra(
  _anterior: EstadoFormularioRegra,
  formData: FormData,
): Promise<EstadoFormularioRegra> {
  const usuario = await exigirUsuario()
  const bruto = Object.fromEntries(formData) as Record<string, string>

  const analise = Formulario.safeParse(bruto)
  if (!analise.success) {
    const problema = analise.error.issues[0]
    return { erro: problema.message, campoInvalido: String(problema.path[0]), valores: bruto }
  }
  const d = analise.data

  let regraId: string
  try {
    const dados: NovaRegra = {
      kind: d.kind,
      description: d.description,
      accountId: d.accountId,
      toAccountId: d.kind === 'transferencia' ? d.toAccountId || null : null,
      categoryId: d.kind === 'transferencia' ? null : d.categoryId || null,
      // Valor que muda a cada vez (luz, água) é despesa variável; o resto é fixa.
      nature: d.kind === 'transferencia' ? null : d.amountIsEstimate === 'on' ? 'variavel' : 'fixa',
      amountCents: parseBRL(d.valor),
      amountIsEstimate: d.amountIsEstimate === 'on',
      unit: d.unit,
      interval: d.interval,
      startDate: isoDate(d.startDate),
      endDate: d.fim === 'data' && d.endDate ? isoDate(d.endDate) : null,
      maxOccurrences: d.fim === 'vezes' && d.maxOccurrences ? Number(d.maxOccurrences) : null,
      weekendPolicy: d.weekendPolicy,
    }
    if (d.fim === 'data' && !dados.endDate) {
      return { erro: 'Informe até quando se repete', campoInvalido: 'endDate', valores: bruto }
    }
    if (d.fim === 'vezes' && !dados.maxOccurrences) {
      return { erro: 'Informe quantas vezes se repete', campoInvalido: 'maxOccurrences', valores: bruto }
    }

    const regra = await criarRegra(usuario.id, dados, { hoje: hojeEm(usuario.timezone) })
    regraId = regra.id
  } catch (erro) {
    return { erro: mensagem(erro), valores: bruto }
  }

  await registrarEvento(usuario.id, {
    eventType: 'regra.criada', objectType: 'recurrence_rule', objectId: regraId,
    source: 'usuario', result: 'sucesso',
  })

  revalidatePath('/recorrencias')
  revalidatePath('/')
  // Fora do try: redirect() funciona lançando exceção.
  redirect(`/recorrencias/${regraId}`)
}

type Operacao = 'pausar' | 'retomar' | 'encerrar'

const OPERACOES = {
  pausar: { executar: pausarRegra, evento: 'regra.pausada' },
  retomar: { executar: retomarRegra, evento: 'regra.retomada' },
  encerrar: { executar: encerrarRegra, evento: 'regra.encerrada' },
} as const

async function mudarEstado(operacao: Operacao, formData: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  const id = String(formData.get('id'))
  const { executar, evento } = OPERACOES[operacao]

  await executar(usuario.id, id, hojeEm(usuario.timezone))
  await registrarEvento(usuario.id, {
    eventType: evento, objectType: 'recurrence_rule', objectId: id,
    source: 'usuario', result: 'sucesso',
  })

  revalidatePath('/recorrencias')
  revalidatePath(`/recorrencias/${id}`)
  revalidatePath('/')
}

export async function pausar(formData: FormData): Promise<void> {
  await mudarEstado('pausar', formData)
}

export async function retomar(formData: FormData): Promise<void> {
  await mudarEstado('retomar', formData)
}

export async function encerrar(formData: FormData): Promise<void> {
  await mudarEstado('encerrar', formData)
}
