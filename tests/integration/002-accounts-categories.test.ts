import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { comoUsuario, criarUsuario, limparBanco, sqlAdmin } from './helpers'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

describe('migração 002', () => {
  it('cartão, investimento e empréstimo ficam fora do disponível por padrão', async () => {
    const usuario = await criarUsuario()

    const contas = await comoUsuario(usuario, async (sql) => {
      await sql`
        insert into accounts (user_id, name, type, initial_balance_cents, initial_balance_date)
        values
          (${usuario}, 'Corrente', 'corrente', 0, '2026-09-01'),
          (${usuario}, 'Cartão', 'cartao_credito', 0, '2026-09-01'),
          (${usuario}, 'CDB', 'investimento', 0, '2026-09-01'),
          (${usuario}, 'Financiamento', 'emprestimo', 0, '2026-09-01')
      `
      return sql<{ type: string; include_in_available: boolean }[]>`
        select type, include_in_available from accounts order by type
      `
    })

    const porTipo = Object.fromEntries(contas.map((c) => [c.type, c.include_in_available]))
    expect(porTipo.corrente).toBe(true)
    expect(porTipo.cartao_credito).toBe(false)
    expect(porTipo.investimento).toBe(false)
    expect(porTipo.emprestimo).toBe(false)
  })

  it('rejeita tipo de conta desconhecido', async () => {
    const usuario = await criarUsuario()
    await expect(
      comoUsuario(usuario, (sql) => sql`
        insert into accounts (user_id, name, type, initial_balance_cents, initial_balance_date)
        values (${usuario}, 'X', 'cripto', 0, '2026-09-01')
      `),
    ).rejects.toThrow()
  })

  it('rejeita moeda diferente de BRL', async () => {
    const usuario = await criarUsuario()
    await expect(
      comoUsuario(usuario, (sql) => sql`
        insert into accounts (user_id, name, type, currency, initial_balance_cents, initial_balance_date)
        values (${usuario}, 'X', 'corrente', 'USD', 0, '2026-09-01')
      `),
    ).rejects.toThrow()
  })

  it('semeia as catorze categorias do §5.5', async () => {
    const usuario = await criarUsuario()
    await sqlAdmin`select seed_categorias_padrao(${usuario})`

    const categorias = await comoUsuario(usuario, (sql) => sql<{ name: string; kind: string }[]>`
      select name, kind from categories order by sort_order
    `)

    expect(categorias).toHaveLength(14)
    expect(categorias[0].name).toBe('Moradia')
    expect(categorias.at(-1)?.name).toBe('Outras')
    expect(categorias.find((c) => c.name === 'Renda')?.kind).toBe('receita')
    expect(categorias.find((c) => c.name === 'Moradia')?.kind).toBe('despesa')
  })

  it('subcategoria aponta para a categoria pai', async () => {
    const usuario = await criarUsuario()
    const [filha] = await comoUsuario(usuario, async (sql) => {
      const [pai] = await sql<{ id: string }[]>`
        insert into categories (user_id, name, kind, sort_order)
        values (${usuario}, 'Transporte', 'despesa', 1)
        returning id
      `
      return sql<{ parent_id: string }[]>`
        insert into categories (user_id, name, kind, parent_id, sort_order)
        values (${usuario}, 'Combustível', 'despesa', ${pai.id}, 2)
        returning parent_id
      `
    })
    expect(filha.parent_id).not.toBeNull()
  })

  it('AMEAÇA T3: conta de um usuário é invisível para outro', async () => {
    const usuarioA = await criarUsuario()
    const usuarioB = await criarUsuario()

    await comoUsuario(usuarioA, (sql) => sql`
      insert into accounts (user_id, name, type, initial_balance_cents, initial_balance_date)
      values (${usuarioA}, 'Secreta', 'corrente', 999999, '2026-09-01')
    `)

    const vistoPorB = await comoUsuario(usuarioB, (sql) => sql`select id from accounts`)
    expect(vistoPorB).toHaveLength(0)
  })
})
