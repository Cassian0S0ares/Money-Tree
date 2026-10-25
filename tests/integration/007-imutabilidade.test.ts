import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { comoUsuario, criarUsuario, limparBanco, sqlAdmin } from './helpers'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

async function cenario(status: 'previsto' | 'liquidado') {
  const usuario = await criarUsuario()
  return comoUsuario(usuario, async (sql) => {
    const contas = await sql<{ id: string }[]>`
      insert into accounts (user_id, name, type, initial_balance_cents, initial_balance_date)
      values (${usuario}, 'Corrente', 'corrente', 0, '2026-09-01'),
             (${usuario}, 'Outra', 'corrente', 0, '2026-09-01')
      returning id
    `
    const [categoria] = await sql<{ id: string }[]>`
      insert into categories (user_id, name, kind) values (${usuario}, 'Mercado', 'despesa') returning id
    `
    const [linha] = await sql<{ id: string }[]>`
      insert into transactions
        (user_id, account_id, category_id, kind, nature, description, amount_cents, direction,
         status, competence_date, settled_date)
      values
        (${usuario}, ${contas[0].id}, ${categoria.id}, 'despesa', 'variavel', 'Compra', 5000, -1,
         ${status}, '2026-09-18', ${status === 'liquidado' ? '2026-09-18' : null})
      returning id
    `
    return { usuario, id: linha.id, outraConta: contas[1].id }
  })
}

describe('AMEAÇA T19: lançamento liquidado não é reescrito', () => {
  const alteracoes: [string, (c: { outraConta: string }) => Record<string, unknown>][] = [
    ['valor', () => ({ amount_cents: 1 })],
    ['descrição', () => ({ description: 'Outra coisa' })],
    ['conta', (c) => ({ account_id: c.outraConta })],
    ['data de competência', () => ({ competence_date: '2026-01-01' })],
    ['natureza', () => ({ nature: 'fixa' })],
    ['observação', () => ({ notes: 'reescrita' })],
    ['data de liquidação sem mudar o estado', () => ({ settled_date: '2026-09-01' })],
  ]

  for (const [nome, mudanca] of alteracoes) {
    it(`recusa mudar ${nome}`, async () => {
      const c = await cenario('liquidado')
      await expect(
        comoUsuario(c.usuario, (sql) => sql`
          update transactions set ${sql(mudanca(c))} where id = ${c.id}
        `),
      ).rejects.toThrow(/estorno/i)
    })
  }

  it('permite as transições: liquidado → conciliado e → estornado', async () => {
    const c = await cenario('liquidado')
    await comoUsuario(c.usuario, (sql) => sql`
      update transactions set status = 'conciliado', updated_at = now() where id = ${c.id}
    `)
    await comoUsuario(c.usuario, (sql) => sql`
      update transactions set status = 'estornado', updated_at = now() where id = ${c.id}
    `)
    const [linha] = await sqlAdmin<{ status: string }[]>`select status from transactions where id = ${c.id}`
    expect(linha.status).toBe('estornado')
  })

  it('lançamento previsto continua editável', async () => {
    const c = await cenario('previsto')
    await comoUsuario(c.usuario, (sql) => sql`
      update transactions set amount_cents = 7000, description = 'Ajustada' where id = ${c.id}
    `)
    const [linha] = await sqlAdmin<{ amount_cents: string }[]>`select amount_cents from transactions where id = ${c.id}`
    expect(Number(linha.amount_cents)).toBe(7000)
  })
})
