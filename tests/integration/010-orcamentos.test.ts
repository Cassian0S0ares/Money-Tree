import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { comoUsuario, criarUsuario, limparBanco, sqlAdmin } from './helpers'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

async function cenario() {
  const usuario = await criarUsuario()
  const ids = await comoUsuario(usuario, async (sql) => {
    const [mercado] = await sql<{ id: string }[]>`
      insert into categories (user_id, name, kind) values (${usuario}, 'Mercado', 'despesa') returning id
    `
    const [feira] = await sql<{ id: string }[]>`
      insert into categories (user_id, name, kind, parent_id) values (${usuario}, 'Feira', 'despesa', ${mercado.id}) returning id
    `
    const [renda] = await sql<{ id: string }[]>`
      insert into categories (user_id, name, kind) values (${usuario}, 'Renda', 'receita') returning id
    `
    return { mercado: mercado.id, feira: feira.id, renda: renda.id }
  })
  return { usuario, ...ids }
}

async function orcamento(usuario: string, categoria: string) {
  const [linha] = await comoUsuario(usuario, (sql) => sql<{ id: string }[]>`
    insert into budgets (user_id, category_id) values (${usuario}, ${categoria}) returning id
  `)
  return linha.id
}

describe('migração 010: budgets', () => {
  it('aceita orçamento em categoria-raiz de despesa', async () => {
    const c = await cenario()
    await expect(orcamento(c.usuario, c.mercado)).resolves.toBeTruthy()
  })

  it('recusa orçamento em subcategoria: o gasto já soma na raiz', async () => {
    const c = await cenario()
    await expect(orcamento(c.usuario, c.feira)).rejects.toThrow(/raiz/i)
  })

  it('recusa orçamento em categoria de receita', async () => {
    const c = await cenario()
    await expect(orcamento(c.usuario, c.renda)).rejects.toThrow(/despesa/i)
  })

  it('um orçamento ativo por categoria; depois de arquivar, pode criar outro', async () => {
    const c = await cenario()
    const primeiro = await orcamento(c.usuario, c.mercado)
    await expect(orcamento(c.usuario, c.mercado)).rejects.toThrow()

    await comoUsuario(c.usuario, (sql) => sql`update budgets set archived_at = now() where id = ${primeiro}`)
    await expect(orcamento(c.usuario, c.mercado)).resolves.toBeTruthy()
  })

  it('AMEAÇA T20: categoria de outro usuário é recusada; T3: RLS', async () => {
    const dono = await cenario()
    const intruso = await cenario()
    await orcamento(dono.usuario, dono.mercado)

    await expect(orcamento(intruso.usuario, dono.mercado)).rejects.toThrow()
    const vistos = await comoUsuario(intruso.usuario, (sql) => sql`select id from budgets`)
    expect(vistos).toHaveLength(0)
  })
})

describe('migração 010: budget_limits', () => {
  it('limite datado, sem repetir a data, nunca negativo', async () => {
    const c = await cenario()
    const id = await orcamento(c.usuario, c.mercado)
    const limite = (data: string, valor: number) =>
      comoUsuario(c.usuario, (sql) => sql`
        insert into budget_limits (user_id, budget_id, starts_on, amount_cents)
        values (${c.usuario}, ${id}, ${data}, ${valor})
      `)

    await limite('2026-10-01', 60_000)
    await limite('2026-11-01', 0)
    await expect(limite('2026-10-01', 70_000)).rejects.toThrow()
    await expect(limite('2026-12-01', -1)).rejects.toThrow()
  })

  it('o histórico de limites não se apaga pela aplicação', async () => {
    const privilegios = await sqlAdmin<{ privilege_type: string }[]>`
      select privilege_type from information_schema.role_table_grants
      where grantee = 'money_tree_app' and table_name in ('budgets', 'budget_limits')
    `
    expect(privilegios.map((p) => p.privilege_type)).not.toContain('DELETE')
  })

  it('AMEAÇA T20: limite não aponta para orçamento de outro usuário', async () => {
    const dono = await cenario()
    const intruso = await cenario()
    const id = await orcamento(dono.usuario, dono.mercado)

    await expect(
      comoUsuario(intruso.usuario, (sql) => sql`
        insert into budget_limits (user_id, budget_id, starts_on, amount_cents)
        values (${intruso.usuario}, ${id}, '2026-10-01', 100)
      `),
    ).rejects.toThrow()
  })
})
