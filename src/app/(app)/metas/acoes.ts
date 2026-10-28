'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import {
  ReservaRecusadaError,
  alterarMeta,
  aportar,
  arquivarMeta,
  concluirMeta,
  criarMeta,
  resgatar,
  type DadosMeta,
} from '../../../data/goals'
import { registrarEvento } from '../../../data/audit'
import { exigirUsuario } from '../../../lib/session'
import { log } from '../../../lib/logger'
import { hojeEm, isoDate } from '../../../domain/dates'
import { cents, parseBRL } from '../../../domain/money'
import type { Cents } from '../../../domain/types'
import { dinheiro } from '../../../lib/format'

const uuidOuVazio = z.string().uuid().optional().or(z.literal(''))

const FormularioMeta = z.object({
  metaId: uuidOuVazio,
  name: z.string().trim().min(1, 'Informe o nome da meta').max(80, 'O nome tem no máximo 80 caracteres'),
  kind: z.enum(['reserva_emergencia', 'viagem', 'compra', 'quitacao_divida', 'educacao', 'longo_prazo', 'livre'], {
    message: 'Escolha o tipo',
  }),
  alvo: z.string().min(1, 'Informe o valor-alvo'),
  data: z.string().optional(),
  priority: z.enum(['alta', 'media', 'baixa'], { message: 'Escolha a prioridade' }),
  accountId: uuidOuVazio,
  contribuicao: z.string().optional(),
})

export interface EstadoMeta {
  erro?: string
  campoInvalido?: string
  valores?: Record<string, string>
  chave?: number
}

/** Erro escrito para a pessoa; o resto vai para o log só com o código. */
function mensagemMeta(erro: unknown): string {
  if (erro instanceof Error && erro.name === 'ValorInvalidoError') return 'Confira os valores informados.'
  if (erro instanceof Error && erro.name === 'DataInvalidaError') return 'Confira a data-alvo.'
  log.error('meta.falhou', { codigo: (erro as { code?: string })?.code })
  return 'Não foi possível salvar a meta. Nada foi gravado; confira os campos e tente de novo.'
}

/** Cria ou altera a meta (spec da fatia 4, seção 8). */
export async function salvarMeta(_anterior: EstadoMeta, formData: FormData): Promise<EstadoMeta> {
  const usuario = await exigirUsuario()
  const bruto = Object.fromEntries(formData) as Record<string, string>

  const analise = FormularioMeta.safeParse(bruto)
  if (!analise.success) {
    const problema = analise.error.issues[0]
    return { erro: problema.message, campoInvalido: String(problema.path[0]), valores: bruto }
  }
  const d = analise.data

  let metaId = d.metaId || null
  try {
    const alvo = parseBRL(d.alvo)
    if (alvo <= 0) return { erro: 'O valor-alvo precisa ser maior que zero', campoInvalido: 'alvo', valores: bruto }

    let contribuicao: Cents | null = null
    if (d.contribuicao && d.contribuicao.trim() !== '') {
      contribuicao = parseBRL(d.contribuicao)
      if (contribuicao <= 0) {
        return { erro: 'A contribuição mensal precisa ser maior que zero', campoInvalido: 'contribuicao', valores: bruto }
      }
    }

    const dados: DadosMeta = {
      name: d.name,
      kind: d.kind,
      targetCents: alvo,
      targetDate: d.data ? isoDate(d.data) : null,
      priority: d.priority,
      accountId: d.accountId || null,
      monthlyContributionCents: contribuicao,
    }

    if (metaId) {
      await alterarMeta(usuario.id, metaId, dados)
    } else {
      const criada = await criarMeta(usuario.id, dados)
      metaId = criada.id
    }
  } catch (erro) {
    return { erro: mensagemMeta(erro), valores: bruto }
  }

  await registrarEvento(usuario.id, {
    eventType: d.metaId ? 'meta.alterada' : 'meta.criada',
    objectType: 'goal', objectId: metaId!, source: 'usuario', result: 'sucesso',
  })
  revalidatePath('/metas')
  revalidatePath(`/metas/${metaId}`)
  revalidatePath('/')
  // Fora do try: redirect() funciona lançando exceção.
  redirect(`/metas/${metaId}`)
}

const FormularioMovimento = z.object({
  metaId: z.string().uuid(),
  operacao: z.enum(['aporte', 'resgate'], { message: 'Escolha reservar ou resgatar' }),
  valor: z.string().min(1, 'Informe o valor'),
  accountId: z.string().uuid('Escolha a conta'),
  data: z.string().min(1, 'Informe a data'),
})

export interface EstadoMovimento {
  erro?: string
  sucesso?: string
  campoInvalido?: string
  valores?: Record<string, string>
  chave?: number
}

/** Mensagem do gatilho de reservas, com o disponível nunca abaixo de zero. */
function mensagemRecusa(erro: ReservaRecusadaError): string {
  const disponivel = cents(Math.max(0, erro.disponivel ?? 0))
  if (erro.motivo === 'saldo') return `Essa conta tem só ${dinheiro(disponivel)} sem reserva`
  if (erro.motivo === 'reserva') return `Essa meta tem só ${dinheiro(disponivel)} reservado nesta conta`
  return 'Essa meta está encerrada ou a conta está arquivada'
}

/** Reservar (aporte) ou resgatar dinheiro de uma conta para a meta (spec 3.3). */
export async function registrarMovimento(_anterior: EstadoMovimento, formData: FormData): Promise<EstadoMovimento> {
  const usuario = await exigirUsuario()
  const bruto = Object.fromEntries(formData) as Record<string, string>

  const analise = FormularioMovimento.safeParse(bruto)
  if (!analise.success) {
    const problema = analise.error.issues[0]
    return { erro: problema.message, campoInvalido: String(problema.path[0]), valores: bruto }
  }
  const d = analise.data

  try {
    const valor = parseBRL(d.valor)
    if (valor <= 0) return { erro: 'O valor precisa ser maior que zero', campoInvalido: 'valor', valores: bruto }
    const movimento = { accountId: d.accountId, amountCents: valor, occurredOn: isoDate(d.data) }

    if (d.operacao === 'aporte') await aportar(usuario.id, d.metaId, movimento)
    else await resgatar(usuario.id, d.metaId, movimento)
  } catch (erro) {
    if (erro instanceof ReservaRecusadaError) {
      return { erro: mensagemRecusa(erro), campoInvalido: 'valor', valores: bruto }
    }
    if (erro instanceof Error && erro.name === 'ValorInvalidoError') {
      return { erro: 'Confira o valor informado.', campoInvalido: 'valor', valores: bruto }
    }
    if (erro instanceof Error && erro.name === 'DataInvalidaError') {
      return { erro: 'Confira a data.', campoInvalido: 'data', valores: bruto }
    }
    log.error('meta.movimento_falhou', { codigo: (erro as { code?: string })?.code })
    return { erro: 'Não foi possível registrar. Nada foi gravado; tente de novo.', valores: bruto }
  }

  await registrarEvento(usuario.id, {
    eventType: d.operacao === 'aporte' ? 'meta.aporte' : 'meta.resgate',
    objectType: 'goal', objectId: d.metaId, source: 'usuario', result: 'sucesso',
  })
  revalidatePath('/metas')
  revalidatePath(`/metas/${d.metaId}`)
  revalidatePath('/contas')
  revalidatePath('/')
  return { sucesso: d.operacao === 'aporte' ? 'Reserva registrada.' : 'Resgate registrado.' }
}

async function encerrar(formData: FormData, operacao: 'concluir' | 'arquivar'): Promise<void> {
  const usuario = await exigirUsuario()
  const id = z.string().uuid().parse(formData.get('id'))
  const hoje = hojeEm(usuario.timezone)

  if (operacao === 'concluir') await concluirMeta(usuario.id, id, hoje)
  else await arquivarMeta(usuario.id, id, hoje)

  await registrarEvento(usuario.id, {
    eventType: operacao === 'concluir' ? 'meta.concluida' : 'meta.arquivada',
    objectType: 'goal', objectId: id, source: 'usuario', result: 'sucesso',
  })
  revalidatePath('/metas')
  revalidatePath(`/metas/${id}`)
  revalidatePath('/contas')
  revalidatePath('/')
}

/** Conclui a meta e libera a reserva (spec 7). A tela só oferece quando atingida. */
export async function concluir(formData: FormData): Promise<void> {
  await encerrar(formData, 'concluir')
}

/** Arquiva a meta e libera a reserva (spec 7). */
export async function arquivar(formData: FormData): Promise<void> {
  await encerrar(formData, 'arquivar')
}
