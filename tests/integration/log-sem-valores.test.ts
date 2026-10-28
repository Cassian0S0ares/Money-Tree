import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inspect } from 'node:util'
import { criarUsuario, limparBanco, sqlAdmin } from './helpers'
import { criarConta } from '../../src/data/accounts'
import { criarCategoria } from '../../src/data/categories'
import { criarLancamento, estornarLancamento } from '../../src/data/transactions'
import { registrarConciliacao } from '../../src/data/reconciliations'
import { comoUsuario } from '../../src/data/with-user'
import {
  criarRegra,
  editarDestaEmDiante,
  garantirOcorrencias,
  ocorrenciasDaRegra,
  pagarOcorrencia,
  pularOcorrencia,
} from '../../src/data/recurrences'
import { definirLimite, removerOrcamentoAcao } from '../../src/app/(app)/orcamentos/acoes'
import { log } from '../../src/lib/logger'
import { isoDate } from '../../src/domain/dates'
import { cents } from '../../src/domain/money'

const DESCRICAO = 'Farmacia-Sigilosa-7731'
const VALOR = 987_654

// As ações de orçamento rodam de verdade; só a sessão e o cache do Next são
// trocados, porque fora de uma requisição não há cookie nem rota.
const sessao = vi.hoisted(() => ({ usuario: '' }))
vi.mock('../../src/lib/session', () => ({
  exigirUsuario: async () => ({ id: sessao.usuario, timezone: 'America/Sao_Paulo' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

let saida: string[] = []

beforeEach(async () => {
  await limparBanco()
  saida = []
  for (const metodo of ['log', 'info', 'warn', 'error'] as const) {
    vi.spyOn(console, metodo).mockImplementation((...args: unknown[]) => {
      saida.push(args.map((a) => (typeof a === 'string' ? a : inspect(a, { depth: 5 }))).join(' '))
    })
  }
})
afterEach(() => vi.restoreAllMocks())
afterAll(() => sqlAdmin.end())

function semDadoFinanceiro() {
  const tudo = saida.join('\n')
  expect(tudo).not.toContain(DESCRICAO)
  expect(tudo).not.toContain(String(VALOR))
}

describe('AMEAÇA T7: valor financeiro não vaza em log', () => {
  it('o fluxo normal não escreve valor nem descrição', async () => {
    const usuario = await criarUsuario()
    const conta = await criarConta(usuario, {
      name: 'Corrente', type: 'corrente',
      initialBalanceCents: cents(0), initialBalanceDate: isoDate('2026-09-01'),
    })
    const categoria = await criarCategoria(usuario, { name: 'Saúde', kind: 'despesa' })

    const lancamento = await criarLancamento(usuario, {
      accountId: conta.id, categoryId: categoria.id, kind: 'despesa', nature: 'variavel',
      description: DESCRICAO, amountCents: cents(VALOR), status: 'liquidado',
      competenceDate: isoDate('2026-09-18'), settledDate: isoDate('2026-09-18'),
    })
    await estornarLancamento(usuario, lancamento.id, `motivo ${DESCRICAO}`)
    await registrarConciliacao(usuario, {
      accountId: conta.id, reportedCents: cents(VALOR), decision: 'ajuste_criado',
      motivo: DESCRICAO, quando: isoDate('2026-09-18'),
    })

    semDadoFinanceiro()
  })

  it('erro de banco, mesmo impresso inteiro, não carrega os valores da linha', async () => {
    const usuario = await criarUsuario()
    const conta = await criarConta(usuario, {
      name: 'Corrente', type: 'corrente',
      initialBalanceCents: cents(0), initialBalanceDate: isoDate('2026-09-01'),
    })

    // Viola tx_despesa_sai direto no banco. Hoje o erro sai limpo por duas
    // razões que este teste trava: com RLS na tabela o Postgres omite o
    // DETAIL "Failing row contains (...)", e o postgres.js só anexa query e
    // parâmetros ao erro com a opção `debug`. Mudar qualquer uma das duas
    // faria os valores aparecerem aqui.
    const erro = await comoUsuario(usuario, (sql) => sql`
      insert into transactions
        (user_id, account_id, kind, nature, description, amount_cents, direction, status, competence_date, settled_date)
      values
        (${usuario}, ${conta.id}, 'despesa', 'variavel', ${DESCRICAO}, ${VALOR}, 1, 'liquidado', '2026-09-18', '2026-09-18')
    `).catch((e: unknown) => e)

    expect(erro).toBeInstanceOf(Error)
    // É o que o Next faz com erro não tratado numa server action.
    console.error(erro)
    log.error('teste.falhou', { erro })

    semDadoFinanceiro()
    // O que serve para diagnosticar continua lá.
    expect(saida.join('\n')).toContain('tx_despesa_sai')
  })

  it('o fluxo de recorrência também não escreve valor nem descrição', async () => {
    const usuario = await criarUsuario()
    const conta = await criarConta(usuario, {
      name: 'Corrente', type: 'corrente',
      initialBalanceCents: cents(0), initialBalanceDate: isoDate('2026-09-01'),
    })
    const hoje = isoDate('2026-10-25')
    const regra = await criarRegra(
      usuario,
      {
        kind: 'despesa', description: DESCRICAO, accountId: conta.id, nature: 'variavel',
        amountCents: cents(VALOR), amountIsEstimate: true, unit: 'semana', interval: 1,
        startDate: isoDate('2026-10-26'),
      },
      { hoje },
    )
    await garantirOcorrencias(usuario, hoje)
    const lista = await ocorrenciasDaRegra(usuario, regra.id)

    for (const ocorrencia of lista.slice(0, 4)) {
      await pagarOcorrencia(usuario, ocorrencia.id, { valor: cents(VALOR), quando: hoje })
    }
    await pularOcorrencia(usuario, lista[4].id)
    await editarDestaEmDiante(usuario, lista[5].id, { amountCents: cents(VALOR + 1) }, hoje)
    await garantirOcorrencias(usuario, hoje)

    semDadoFinanceiro()
  })

  it('o fluxo de orçamento não escreve valor no log nem na trilha de auditoria', async () => {
    const usuario = await criarUsuario()
    sessao.usuario = usuario
    const categoria = await criarCategoria(usuario, { name: 'Saúde', kind: 'despesa' })
    const formulario = (campos: Record<string, string>) => {
      const dados = new FormData()
      for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor)
      return dados
    }

    // 987.654 centavos digitados como o usuário digita: "9.876,54".
    const criado = await definirLimite({}, formulario({
      categoriaId: categoria.id, valor: '9.876,54', aPartirDe: '2026-10-01',
    }))
    expect(criado).toEqual({ sucesso: true })
    const [orcamento] = await sqlAdmin<{ id: string }[]>`select id from budgets`

    await definirLimite({}, formulario({
      categoriaId: categoria.id, orcamentoId: orcamento.id, valor: '9.876,55', aPartirDe: '2026-11-01',
    }))
    await definirLimite({}, formulario({
      categoriaId: categoria.id, orcamentoId: orcamento.id, valor: '9.876,55', aPartirDe: '2026-12-01',
      rollover: 'on',
    }))
    await removerOrcamentoAcao(formulario({ id: orcamento.id }))

    const eventos = await sqlAdmin<Record<string, unknown>[]>`
      select * from audit_events order by occurred_at, event_type
    `
    expect(eventos.map((e) => e.event_type).sort()).toEqual([
      'orcamento.acumulacao_alterada', 'orcamento.criado',
      'orcamento.limite_alterado', 'orcamento.limite_alterado', 'orcamento.removido',
    ].sort())
    const trilha = JSON.stringify(eventos)
    for (const proibido of [String(VALOR), String(VALOR + 1), '9.876,5']) {
      expect(trilha).not.toContain(proibido)
    }
    // O identificador real do orçamento também não entra: só o pseudônimo.
    expect(trilha).not.toContain(orcamento.id)

    semDadoFinanceiro()
    expect(saida.join('\n')).not.toContain(String(VALOR + 1))
  })
})
