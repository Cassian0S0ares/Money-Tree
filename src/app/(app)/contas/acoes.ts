'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { arquivarConta, atualizarConta, criarConta } from '../../../data/accounts'
import { registrarEvento } from '../../../data/audit'
import { exigirUsuario } from '../../../lib/session'
import { isoDate } from '../../../domain/dates'
import { parseBRL } from '../../../domain/money'
import type { AccountType } from '../../../domain/types'

const TIPOS: AccountType[] = [
  'corrente', 'pagamento', 'poupanca', 'carteira',
  'cartao_credito', 'investimento', 'emprestimo', 'outro',
]

const Formulario = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'Informe o nome da conta'),
  type: z.enum(TIPOS as [AccountType, ...AccountType[]]),
  institution: z.string().trim().optional(),
  saldoInicial: z.string(),
  initialBalanceDate: z.string(),
  includeInAvailable: z.string().optional(),
})

export interface EstadoFormularioConta {
  erro?: string
  campoInvalido?: string
  /** O que o usuário digitou, para o formulário não esvaziar (§13). */
  valores?: Record<string, string>
  /** Incrementada no cliente a cada resposta, para remontar o formulário. */
  chave?: number
}

export async function salvarConta(
  _anterior: EstadoFormularioConta,
  formData: FormData,
): Promise<EstadoFormularioConta> {
  const usuario = await exigirUsuario()

  const bruto = Object.fromEntries(formData) as Record<string, string>
  const analise = Formulario.safeParse(bruto)

  if (!analise.success) {
    const problema = analise.error.issues[0]
    return { erro: problema.message, campoInvalido: String(problema.path[0]), valores: bruto }
  }

  let saldoInicialCents
  let dataInicial
  try {
    saldoInicialCents = parseBRL(analise.data.saldoInicial || '0')
    dataInicial = isoDate(analise.data.initialBalanceDate)
  } catch (erro) {
    return {
      erro: erro instanceof Error ? erro.message : 'Valor ou data inválidos',
      campoInvalido: 'saldoInicial',
      valores: bruto,
    }
  }

  const dados = {
    name: analise.data.name,
    type: analise.data.type,
    institution: analise.data.institution || null,
    initialBalanceCents: saldoInicialCents,
    initialBalanceDate: dataInicial,
    // Checkbox ausente no envio significa desmarcado. O padrão por tipo já
    // foi aplicado no formulário, então o que chega aqui é escolha explícita.
    includeInAvailable: analise.data.includeInAvailable === 'on',
  }

  const conta = analise.data.id
    ? await atualizarConta(usuario.id, analise.data.id, dados)
    : await criarConta(usuario.id, dados)

  await registrarEvento(usuario.id, {
    eventType: analise.data.id ? 'conta.atualizada' : 'conta.criada',
    objectType: 'account',
    objectId: conta.id,
    source: 'usuario',
    result: 'sucesso',
  })

  revalidatePath('/contas')
  revalidatePath('/')
  redirect('/contas')
}

export async function arquivar(formData: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  const id = String(formData.get('id'))

  await arquivarConta(usuario.id, id)
  await registrarEvento(usuario.id, {
    eventType: 'conta.arquivada',
    objectType: 'account',
    objectId: id,
    source: 'usuario',
    result: 'sucesso',
  })

  revalidatePath('/contas')
  revalidatePath('/')
}
