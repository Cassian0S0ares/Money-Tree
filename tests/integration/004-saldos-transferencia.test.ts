import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { comoUsuario, criarUsuario, limparBanco, sqlAdmin } from './helpers'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

async function duasContas() {
  const usuario = await criarUsuario()
  const contas = await comoUsuario(usuario, (sql) => sql<{ id: string; name: string }[]>`
    insert into accounts (user_id, name, type, initial_balance_cents, initial_balance_date)
    values
      (${usuario}, 'Corrente', 'corrente', 100000, '2026-09-01'),
      (${usuario}, 'Poupança', 'poupanca',  50000, '2026-09-01')
    returning id, name
  `)
  return {
    usuario,
    corrente: contas.find((c) => c.name === 'Corrente')!.id,
    poupanca: contas.find((c) => c.name === 'Poupança')!.id,
  }
}

describe('view account_balances', () => {
  it('sem lançamentos, o saldo é o inicial e é estimado', async () => {
    const { usuario, corrente } = await duasContas()
    const [saldo] = await comoUsuario(usuario, (sql) => sql<
      { balance_cents: string; is_estimated: boolean }[]
    >`select balance_cents, is_estimated from account_balances where account_id = ${corrente}`)

    expect(Number(saldo.balance_cents)).toBe(100000)
    expect(saldo.is_estimated).toBe(true)
  })

  it('soma apenas liquidado e conciliado', async () => {
    const { usuario, corrente } = await duasContas()

    await comoUsuario(usuario, (sql) => sql`
      insert into transactions
        (user_id, account_id, kind, nature, description, amount_cents, direction, status, competence_date, settled_date)
      values
        (${usuario}, ${corrente}, 'despesa', 'variavel', 'Paga',     5000, -1, 'liquidado', '2026-09-10', '2026-09-10'),
        (${usuario}, ${corrente}, 'despesa', 'variavel', 'Prevista', 9900, -1, 'previsto',  '2026-09-20', null)
    `)

    const [saldo] = await comoUsuario(usuario, (sql) => sql<{ balance_cents: string }[]>`
      select balance_cents from account_balances where account_id = ${corrente}
    `)
    expect(Number(saldo.balance_cents)).toBe(95000)
  })

  it('conciliada e sem movimento posterior deixa de ser estimada', async () => {
    const { usuario, corrente } = await duasContas()

    await comoUsuario(usuario, (sql) => sql`
      update accounts set last_reconciled_at = '2026-09-15T00:00:00Z' where id = ${corrente}
    `)

    const [saldo] = await comoUsuario(usuario, (sql) => sql<{ is_estimated: boolean }[]>`
      select is_estimated from account_balances where account_id = ${corrente}
    `)
    expect(saldo.is_estimated).toBe(false)
  })

  it('movimento após a conciliação volta a estimar', async () => {
    const { usuario, corrente } = await duasContas()

    await comoUsuario(usuario, async (sql) => {
      await sql`update accounts set last_reconciled_at = '2026-09-15T00:00:00Z' where id = ${corrente}`
      await sql`
        insert into transactions
          (user_id, account_id, kind, nature, description, amount_cents, direction, status, competence_date, settled_date)
        values (${usuario}, ${corrente}, 'despesa', 'variavel', 'Depois', 100, -1, 'liquidado', '2026-09-20', '2026-09-20')
      `
    })

    const [saldo] = await comoUsuario(usuario, (sql) => sql<{ is_estimated: boolean }[]>`
      select is_estimated from account_balances where account_id = ${corrente}
    `)
    expect(saldo.is_estimated).toBe(true)
  })

  it('AMEAÇA T3: a view respeita a RLS de quem consulta', async () => {
    // View roda com os privilégios do dono, e o dono da migração ignora RLS.
    // Sem security_invoker, B enxergaria o saldo de A.
    await duasContas()
    const intruso = await criarUsuario()

    const vistoPeloIntruso = await comoUsuario(intruso, (sql) => sql`
      select account_id from account_balances
    `)
    expect(vistoPeloIntruso).toHaveLength(0)
  })
})

describe('create_transfer', () => {
  it('cria dois lados vinculados', async () => {
    const { usuario, corrente, poupanca } = await duasContas()

    const lados = await comoUsuario(usuario, async (sql) => {
      await sql`
        select create_transfer(
          ${usuario}, ${corrente}, ${poupanca}, 30000,
          'Guardando', '2026-09-18'::date, '2026-09-18'::date, 'liquidado'::transaction_status, null
        )
      `
      return sql<{ account_id: string; direction: number; transfer_group_id: string }[]>`
        select account_id, direction, transfer_group_id from transactions order by direction
      `
    })

    expect(lados).toHaveLength(2)
    expect(lados[0].direction).toBe(-1)
    expect(lados[0].account_id).toBe(corrente)
    expect(lados[1].direction).toBe(1)
    expect(lados[1].account_id).toBe(poupanca)
    expect(lados[0].transfer_group_id).toBe(lados[1].transfer_group_id)
  })

  it('INVARIANTE: transferência não altera o total', async () => {
    const { usuario, corrente, poupanca } = await duasContas()

    const total = async () => {
      const [linha] = await comoUsuario(usuario, (sql) => sql<{ soma: string }[]>`
        select coalesce(sum(balance_cents), 0) as soma from account_balances
      `)
      return Number(linha.soma)
    }

    const antes = await total()

    await comoUsuario(usuario, (sql) => sql`
      select create_transfer(
        ${usuario}, ${corrente}, ${poupanca}, 30000,
        'Guardando', '2026-09-18'::date, '2026-09-18'::date, 'liquidado'::transaction_status, null
      )
    `)

    expect(await total()).toBe(antes)
  })

  it('AMEAÇA T10: falha em um lado não deixa o outro gravado', async () => {
    const { usuario, corrente } = await duasContas()
    const contaInexistente = crypto.randomUUID()

    await expect(
      comoUsuario(usuario, (sql) => sql`
        select create_transfer(
          ${usuario}, ${corrente}, ${contaInexistente}, 30000,
          'Quebrada', '2026-09-18'::date, '2026-09-18'::date, 'liquidado'::transaction_status, null
        )
      `),
    ).rejects.toThrow()

    const linhas = await comoUsuario(usuario, (sql) => sql`select id from transactions`)
    expect(linhas).toHaveLength(0)
  })

  it('recusa transferência para a mesma conta', async () => {
    const { usuario, corrente } = await duasContas()
    await expect(
      comoUsuario(usuario, (sql) => sql`
        select create_transfer(
          ${usuario}, ${corrente}, ${corrente}, 1000,
          'Círculo', '2026-09-18'::date, '2026-09-18'::date, 'liquidado'::transaction_status, null
        )
      `),
    ).rejects.toThrow(/mesma conta/i)
  })
})

describe('reconciliations e audit_events', () => {
  it('registra a diferença e a decisão', async () => {
    const { usuario, corrente } = await duasContas()

    const [registro] = await comoUsuario(usuario, (sql) => sql<{ difference_cents: string }[]>`
      insert into reconciliations
        (user_id, account_id, reported_balance_cents, calculated_balance_cents, decision)
      values (${usuario}, ${corrente}, 98000, 100000, 'ajuste_criado')
      returning difference_cents
    `)

    expect(Number(registro.difference_cents)).toBe(-2000)
  })

  it('audit_events não tem coluna para valor nem descrição', async () => {
    const colunas = await sqlAdmin<{ column_name: string }[]>`
      select column_name from information_schema.columns where table_name = 'audit_events'
    `
    const nomes = colunas.map((c) => c.column_name)

    for (const proibida of ['amount_cents', 'description', 'value', 'notes', 'counterparty', 'token']) {
      expect(nomes).not.toContain(proibida)
    }
  })

  it('AMEAÇA T7: trilha de auditoria é somente inserção para a aplicação', async () => {
    const privilegios = await sqlAdmin<{ privilege_type: string }[]>`
      select privilege_type from information_schema.role_table_grants
      where grantee = 'money_tree_app' and table_name = 'audit_events'
    `
    expect(privilegios.map((p) => p.privilege_type).sort()).toEqual(['INSERT', 'SELECT'])
  })
})
