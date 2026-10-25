import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inspect } from 'node:util'
import { criarUsuario, limparBanco, sqlAdmin } from './helpers'
import { criarConta } from '../../src/data/accounts'
import { criarCategoria } from '../../src/data/categories'
import { criarLancamento, estornarLancamento } from '../../src/data/transactions'
import { registrarConciliacao } from '../../src/data/reconciliations'
import { comoUsuario } from '../../src/data/with-user'
import { log } from '../../src/lib/logger'
import { isoDate } from '../../src/domain/dates'
import { cents } from '../../src/domain/money'

const DESCRICAO = 'Farmacia-Sigilosa-7731'
const VALOR = 987_654

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
})
