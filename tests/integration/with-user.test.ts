import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, limparBanco, sqlAdmin } from './helpers'
import { comoUsuario, semUsuario } from '../../src/data/with-user'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

describe('comoUsuario', () => {
  it('define app.user_id dentro da transação', async () => {
    const usuario = await criarUsuario()
    const [linha] = await comoUsuario(usuario, (sql) => sql<{ atual: string }[]>`
      select app_user_id()::text as atual
    `)
    expect(linha.atual).toBe(usuario)
  })

  it('a variável não vaza para fora da transação', async () => {
    const usuario = await criarUsuario()
    await comoUsuario(usuario, (sql) => sql`select 1`)

    const [linha] = await semUsuario((sql) => sql<{ atual: string | null }[]>`
      select app_user_id()::text as atual
    `)
    expect(linha.atual).toBeNull()
  })

  it('erro dentro da transação desfaz tudo', async () => {
    const usuario = await criarUsuario()

    await expect(
      comoUsuario(usuario, async (sql) => {
        await sql`
          insert into accounts (user_id, name, type, initial_balance_cents, initial_balance_date)
          values (${usuario}, 'Vai sumir', 'corrente', 0, '2026-09-01')
        `
        throw new Error('falha proposital')
      }),
    ).rejects.toThrow('falha proposital')

    const contas = await comoUsuario(usuario, (sql) => sql`select id from accounts`)
    expect(contas).toHaveLength(0)
  })

  it('AMEAÇA T3: dois usuários em paralelo não se misturam', async () => {
    const usuarioA = await criarUsuario()
    const usuarioB = await criarUsuario()

    const [vistoA, vistoB] = await Promise.all([
      comoUsuario(usuarioA, async (sql) => {
        await sql`
          insert into accounts (user_id, name, type, initial_balance_cents, initial_balance_date)
          values (${usuarioA}, 'A', 'corrente', 100, '2026-09-01')
        `
        return sql<{ name: string }[]>`select name from accounts`
      }),
      comoUsuario(usuarioB, async (sql) => {
        await sql`
          insert into accounts (user_id, name, type, initial_balance_cents, initial_balance_date)
          values (${usuarioB}, 'B', 'corrente', 200, '2026-09-01')
        `
        return sql<{ name: string }[]>`select name from accounts`
      }),
    ])

    expect(vistoA.map((c) => c.name)).toEqual(['A'])
    expect(vistoB.map((c) => c.name)).toEqual(['B'])
  })
})
