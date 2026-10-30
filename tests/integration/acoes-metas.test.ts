import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { criarUsuario, limparBanco, sqlAdmin } from './helpers'
import { criarConta } from '../../src/data/accounts'
import { buscarMeta } from '../../src/data/goals'
import {
  arquivar,
  concluir,
  registrarMovimento,
  salvarMeta,
} from '../../src/app/(app)/metas/acoes'
import { hojeEm, isoDate } from '../../src/domain/dates'
import { cents, formatBRL } from '../../src/domain/money'

const NOME = 'Viagem-Sigilosa-4410'

// As ações rodam de verdade; só a sessão, o cache e o redirect do Next são
// trocados, porque fora de uma requisição não há cookie nem rota.
const sessao = vi.hoisted(() => ({ usuario: '' }))
vi.mock('../../src/lib/session', () => ({
  exigirUsuario: async () => ({ id: sessao.usuario, timezone: 'America/Sao_Paulo', monthStartDay: 1 }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

function formulario(campos: Record<string, string>): FormData {
  const dados = new FormData()
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor)
  return dados
}

async function criarMetaPelaAcao(accountId: string): Promise<string> {
  const resposta = salvarMeta({}, formulario({
    name: NOME, kind: 'viagem', alvo: '500,00', data: '', priority: 'alta',
    accountId, contribuicao: '',
  }))
  const erro = await resposta.then(() => null, (e: Error) => e)
  const casou = /^REDIRECT:\/metas\/([0-9a-f-]{36})$/.exec(erro?.message ?? '')
  expect(casou).not.toBeNull()
  return casou![1]
}

async function cenario() {
  const usuario = await criarUsuario()
  sessao.usuario = usuario
  const conta = await criarConta(usuario, {
    name: 'Corrente', type: 'corrente',
    initialBalanceCents: cents(80_000), initialBalanceDate: isoDate('2026-01-01'),
  })
  return { usuario, conta }
}

describe('ações de metas', () => {
  it('cria, reserva, recusa acima do saldo, conclui e audita sem valor nem nome', async () => {
    const { usuario, conta } = await cenario()
    const hoje = hojeEm('America/Sao_Paulo')

    const metaId = await criarMetaPelaAcao(conta.id)

    const aporte = await registrarMovimento({}, formulario({
      metaId, operacao: 'aporte', valor: '500,00', accountId: conta.id, data: hoje,
    }))
    expect(aporte.erro).toBeUndefined()
    expect(aporte.sucesso).toBe('Reserva registrada.')

    // Sobram R$ 300,00 sem reserva na conta.
    const recusado = await registrarMovimento({}, formulario({
      metaId, operacao: 'aporte', valor: '400,00', accountId: conta.id, data: hoje,
    }))
    expect(recusado.erro).toBe(`Essa conta tem só ${formatBRL(cents(30_000))} sem reserva`)

    const resgateDemais = await registrarMovimento({}, formulario({
      metaId, operacao: 'resgate', valor: '600,00', accountId: conta.id, data: hoje,
    }))
    expect(resgateDemais.erro).toBe(`Essa meta tem só ${formatBRL(cents(50_000))} reservado nesta conta`)

    const antes = await buscarMeta(usuario, metaId, hoje, 1)
    expect(antes!.meta.avaliacao.atingida).toBe(true)

    await concluir(formulario({ id: metaId }))
    const depois = await buscarMeta(usuario, metaId, hoje, 1)
    expect(depois!.meta.completedAt).not.toBeNull()
    expect(depois!.meta.reservado).toBe(0)

    const encerrada = await registrarMovimento({}, formulario({
      metaId, operacao: 'aporte', valor: '1,00', accountId: conta.id, data: hoje,
    }))
    expect(encerrada.erro).toBe('Essa meta está encerrada ou a conta está arquivada')

    const eventos = await sqlAdmin<Record<string, unknown>[]>`
      select * from audit_events where event_type like 'meta.%' order by occurred_at, event_type
    `
    expect(eventos.map((e) => e.event_type).sort()).toEqual(['meta.aporte', 'meta.concluida', 'meta.criada'])
    for (const evento of eventos) {
      expect(evento.object_type).toBe('goal')
      expect(evento.object_ref).not.toBe(metaId)
      const texto = JSON.stringify(evento)
      expect(texto).not.toContain(NOME)
      expect(texto).not.toContain('50000')
      expect(texto).not.toContain('500,00')
    }
  })

  it('formulário inválido devolve a mensagem e não grava', async () => {
    const { conta } = await cenario()
    const resposta = await salvarMeta({}, formulario({
      name: NOME, kind: 'viagem', alvo: '0,00', data: '', priority: 'alta',
      accountId: conta.id, contribuicao: '',
    }))
    expect(resposta.erro).toBe('O valor-alvo precisa ser maior que zero')
    const [{ total }] = await sqlAdmin<{ total: number }[]>`select count(*)::int as total from goals`
    expect(total).toBe(0)
  })

  it('arquivar libera a reserva e registra meta.arquivada', async () => {
    const { usuario, conta } = await cenario()
    const hoje = hojeEm('America/Sao_Paulo')
    const metaId = await criarMetaPelaAcao(conta.id)
    await registrarMovimento({}, formulario({
      metaId, operacao: 'aporte', valor: '100,00', accountId: conta.id, data: hoje,
    }))

    await arquivar(formulario({ id: metaId }))

    const meta = await buscarMeta(usuario, metaId, hoje, 1)
    expect(meta!.meta.archivedAt).not.toBeNull()
    expect(meta!.meta.reservado).toBe(0)
    const [evento] = await sqlAdmin`select 1 from audit_events where event_type = 'meta.arquivada'`
    expect(evento).toBeDefined()
  })
})
