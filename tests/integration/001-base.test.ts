import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { comoUsuario, criarUsuario, limparBanco, sqlAdmin } from './helpers'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

describe('migração 001', () => {
  it('cria o role da aplicação sem poder de bypass', async () => {
    const [role] = await sqlAdmin<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      select rolsuper, rolbypassrls from pg_roles where rolname = 'money_tree_app'
    `
    expect(role.rolsuper).toBe(false)
    expect(role.rolbypassrls).toBe(false)
  })

  it('força RLS em users e sessions', async () => {
    const tabelas = await sqlAdmin<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
      select relname, relrowsecurity, relforcerowsecurity
      from pg_class
      where relname in ('users', 'sessions')
      order by relname
    `
    expect(tabelas).toHaveLength(2)
    for (const tabela of tabelas) {
      expect(tabela.relrowsecurity).toBe(true)
      expect(tabela.relforcerowsecurity).toBe(true)
    }
  })

  it('rejeita e-mail duplicado ignorando maiúsculas', async () => {
    await criarUsuario('Pessoa@Exemplo.com')
    await expect(criarUsuario('pessoa@exemplo.com')).rejects.toThrow()
  })

  it('rejeita dia de início do mês fora de 1..31', async () => {
    await expect(sqlAdmin`
      insert into users (email, password_hash, display_name, month_start_day)
      values ('x@exemplo.com', 'h', 'X', 32)
    `).rejects.toThrow()
  })

  it('rejeita moeda diferente de BRL, como manda o §5.2', async () => {
    await expect(sqlAdmin`
      insert into users (email, password_hash, display_name, currency)
      values ('y@exemplo.com', 'h', 'Y', 'USD')
    `).rejects.toThrow()
  })

  it('AMEAÇA T3: um usuário não enxerga o outro', async () => {
    const usuarioA = await criarUsuario()
    const usuarioB = await criarUsuario()

    const vistoPorA = await comoUsuario(usuarioA, (sql) => sql`select id from users`)
    expect(vistoPorA.map((linha) => linha.id)).toEqual([usuarioA])

    const vistoPorB = await comoUsuario(usuarioB, (sql) => sql`select id from users`)
    expect(vistoPorB.map((linha) => linha.id)).toEqual([usuarioB])
  })

  it('AMEAÇA T4: sem app.user_id definido, não enxerga nada', async () => {
    await criarUsuario()
    const vazio = await sqlAdmin.begin(async (tx) => {
      await tx`set local role money_tree_app`
      return tx`select id from users`
    })
    expect(vazio).toHaveLength(0)
  })
})
