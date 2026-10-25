import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { comoUsuario, criarUsuario, limparBanco, sqlAdmin } from './helpers'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

async function cenario() {
  const usuario = await criarUsuario()
  const ids = await comoUsuario(usuario, async (sql) => {
    const contas = await sql<{ id: string }[]>`
      insert into accounts (user_id, name, type, initial_balance_cents, initial_balance_date)
      values (${usuario}, 'Corrente', 'corrente', 0, '2026-09-01'),
             (${usuario}, 'Poupança', 'poupanca', 0, '2026-09-01')
      returning id
    `
    const [categoria] = await sql<{ id: string }[]>`
      insert into categories (user_id, name, kind) values (${usuario}, 'Moradia', 'despesa') returning id
    `
    return { conta: contas[0].id, poupanca: contas[1].id, categoria: categoria.id }
  })
  return { usuario, ...ids }
}

function aluguel(c: { usuario: string; conta: string; categoria: string }) {
  return {
    user_id: c.usuario,
    kind: 'despesa',
    description: 'Aluguel',
    account_id: c.conta,
    category_id: c.categoria,
    nature: 'fixa',
    amount_cents: 150_000,
    unit: 'mes',
    interval_count: 1,
    start_date: '2026-10-05',
    day_of_month: 5,
    weekend_policy: 'proximo_dia_util',
  }
}

async function criarRegra(usuario: string, dados: Record<string, unknown>) {
  const [regra] = await comoUsuario(usuario, (sql) => sql<{ id: string; series_id: string }[]>`
    insert into recurrence_rules ${sql(dados)} returning id, series_id
  `)
  return regra
}

describe('migração 009: recurrence_rules', () => {
  it('aceita a regra mensal e dá uma série nova a ela', async () => {
    const c = await cenario()
    const regra = await criarRegra(c.usuario, aluguel(c))
    expect(regra.series_id).toBeTruthy()

    const [linha] = await sqlAdmin<{ status: string; amount_is_estimate: boolean }[]>`
      select status, amount_is_estimate from recurrence_rules where id = ${regra.id}
    `
    expect(linha).toEqual({ status: 'ativa', amount_is_estimate: false })
  })

  it.each([
    ['ajuste não se repete', { kind: 'ajuste', category_id: null, nature: null }],
    ['transferência sem destino', { kind: 'transferencia', category_id: null, nature: null }],
    ['despesa sem natureza', { nature: null }],
    ['valor zero', { amount_cents: 0 }],
    ['intervalo zero', { interval_count: 0 }],
    ['intervalo acima de 366', { interval_count: 367 }],
    ['dia do mês 32', { day_of_month: 32 }],
    ['mensal sem dia do mês', { day_of_month: null }],
    ['semanal com dia do mês', { unit: 'semana' }],
    ['fim antes do início', { end_date: '2026-01-01' }],
    ['dois fins', { end_date: '2027-01-01', max_occurrences: 3 }],
    ['zero vezes', { max_occurrences: 0 }],
  ])('recusa %s', async (_nome, mudanca) => {
    const c = await cenario()
    await expect(criarRegra(c.usuario, { ...aluguel(c), ...mudanca })).rejects.toThrow()
  })

  it('transferência exige destino diferente da origem e não leva categoria', async () => {
    const c = await cenario()
    const transferencia = { ...aluguel(c), kind: 'transferencia', category_id: null, nature: null }

    await expect(criarRegra(c.usuario, { ...transferencia, to_account_id: c.conta })).rejects.toThrow()
    await expect(
      criarRegra(c.usuario, { ...transferencia, to_account_id: c.poupanca, category_id: c.categoria }),
    ).rejects.toThrow()
    await expect(criarRegra(c.usuario, { ...transferencia, to_account_id: c.poupanca })).resolves.toBeTruthy()
  })

  it('a aplicação não apaga regra: ocorrências pagas apontam para ela', async () => {
    const privilegios = await sqlAdmin<{ privilege_type: string }[]>`
      select privilege_type from information_schema.role_table_grants
      where grantee = 'money_tree_app' and table_name = 'recurrence_rules'
    `
    expect(privilegios.map((p) => p.privilege_type)).not.toContain('DELETE')
  })

  it('AMEAÇA T20: RLS e referência a conta de outro usuário', async () => {
    const dono = await cenario()
    const intruso = await cenario()
    await criarRegra(dono.usuario, aluguel(dono))

    const vistas = await comoUsuario(intruso.usuario, (sql) => sql`select id from recurrence_rules`)
    expect(vistas).toHaveLength(0)

    await expect(
      criarRegra(intruso.usuario, { ...aluguel(intruso), account_id: dono.conta }),
    ).rejects.toThrow()
  })
})

describe('migração 009: ocorrências em transactions', () => {
  async function ocorrencia(
    c: { usuario: string; conta: string; categoria: string },
    regra: { id: string; series_id: string },
    data: string,
  ) {
    return comoUsuario(c.usuario, (sql) => sql`
      insert into transactions (
        user_id, account_id, category_id, kind, nature, description, amount_cents, direction,
        status, competence_date, due_date, recurrence_rule_id, recurrence_series_id, occurrence_date
      ) values (
        ${c.usuario}, ${c.conta}, ${c.categoria}, 'despesa', 'fixa', 'Aluguel', 150000, -1,
        'previsto', ${data}, ${data}, ${regra.id}, ${regra.series_id}, ${data}
      )
    `)
  }

  it('AMEAÇA T17: a mesma data da mesma série não entra duas vezes', async () => {
    const c = await cenario()
    const regra = await criarRegra(c.usuario, aluguel(c))

    await ocorrencia(c, regra, '2026-10-05')
    await expect(ocorrencia(c, regra, '2026-10-05')).rejects.toThrow()
    await expect(ocorrencia(c, regra, '2026-11-05')).resolves.toBeTruthy()
  })

  it('a série vale entre regras divididas: a nova não recria data ocupada pela antiga', async () => {
    const c = await cenario()
    const antiga = await criarRegra(c.usuario, aluguel(c))
    const nova = await criarRegra(c.usuario, {
      ...aluguel(c), series_id: antiga.series_id, start_date: '2026-12-05',
    })

    await ocorrencia(c, antiga, '2027-01-05')
    await expect(ocorrencia(c, nova, '2027-01-05')).rejects.toThrow()
  })

  it('série precisa ser a da regra', async () => {
    const c = await cenario()
    const regra = await criarRegra(c.usuario, aluguel(c))
    const outra = await criarRegra(c.usuario, aluguel(c))

    await expect(ocorrencia(c, { id: regra.id, series_id: outra.series_id }, '2026-10-05')).rejects.toThrow()
  })

  it('regra, série e data nominal vêm juntas ou não vêm', async () => {
    const c = await cenario()
    const regra = await criarRegra(c.usuario, aluguel(c))

    await expect(
      comoUsuario(c.usuario, (sql) => sql`
        insert into transactions (
          user_id, account_id, category_id, kind, nature, description, amount_cents, direction,
          status, competence_date, recurrence_rule_id, recurrence_series_id
        ) values (
          ${c.usuario}, ${c.conta}, ${c.categoria}, 'despesa', 'fixa', 'Aluguel', 150000, -1,
          'previsto', '2026-10-05', ${regra.id}, ${regra.series_id}
        )
      `),
    ).rejects.toThrow()
  })

  it('create_transfer grava os dois lados como ocorrência da mesma data', async () => {
    const c = await cenario()
    const regra = await criarRegra(c.usuario, {
      ...aluguel(c), kind: 'transferencia', category_id: null, nature: null, to_account_id: c.poupanca,
    })

    await comoUsuario(c.usuario, (sql) => sql`
      select create_transfer(
        ${c.usuario}, ${c.conta}, ${c.poupanca}, 50000, 'Reserva',
        '2026-10-05'::date, null::date, 'previsto'::transaction_status, null,
        ${regra.id}::uuid, '2026-10-05'::date, '2026-10-05'::date
      )
    `)

    const lados = await sqlAdmin<{ direction: number; occurrence_date: Date; recurrence_series_id: string }[]>`
      select direction, occurrence_date, recurrence_series_id from transactions order by direction
    `
    expect(lados).toHaveLength(2)
    expect(lados.every((l) => l.recurrence_series_id === regra.series_id)).toBe(true)
  })

  it('create_transfer continua aceitando a chamada antiga', async () => {
    const c = await cenario()
    await comoUsuario(c.usuario, (sql) => sql`
      select create_transfer(
        ${c.usuario}, ${c.conta}, ${c.poupanca}, 100, 'Avulsa',
        '2026-10-05'::date, '2026-10-05'::date, 'liquidado'::transaction_status, null
      )
    `)
    const [contagem] = await sqlAdmin<{ total: string }[]>`select count(*)::text as total from transactions`
    expect(Number(contagem.total)).toBe(2)
  })
})
