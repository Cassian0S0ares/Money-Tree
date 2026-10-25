import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { comoUsuario, criarUsuario, limparBanco, sqlAdmin } from './helpers'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

async function contaDe(usuario: string) {
  const [conta] = await comoUsuario(usuario, (sql) => sql<{ id: string }[]>`
    insert into accounts (user_id, name, type, initial_balance_cents, initial_balance_date)
    values (${usuario}, 'Conta', 'corrente', 0, '2026-09-01') returning id
  `)
  const [categoria] = await comoUsuario(usuario, (sql) => sql<{ id: string }[]>`
    insert into categories (user_id, name, kind) values (${usuario}, 'Mercado', 'despesa') returning id
  `)
  return { conta: conta.id, categoria: categoria.id }
}

describe('AMEAÇA T20: referência a dado de outro usuário', () => {
  it('lançamento não pode apontar para conta de outro usuário', async () => {
    const vitima = await criarUsuario()
    const atacante = await criarUsuario()
    const daVitima = await contaDe(vitima)

    // A checagem de chave estrangeira roda como dono da tabela e não passa
    // pela RLS: só uma chave composta com user_id barra isto.
    await expect(
      comoUsuario(atacante, (sql) => sql`
        insert into transactions
          (user_id, account_id, kind, nature, description, amount_cents, direction, status, competence_date)
        values
          (${atacante}, ${daVitima.conta}, 'despesa', 'variavel', 'X', 100, -1, 'previsto', '2026-09-18')
      `),
    ).rejects.toThrow()
  })

  it('lançamento não pode usar categoria de outro usuário', async () => {
    const vitima = await criarUsuario()
    const atacante = await criarUsuario()
    const daVitima = await contaDe(vitima)
    const doAtacante = await contaDe(atacante)

    await expect(
      comoUsuario(atacante, (sql) => sql`
        insert into transactions
          (user_id, account_id, category_id, kind, nature, description, amount_cents, direction, status, competence_date)
        values
          (${atacante}, ${doAtacante.conta}, ${daVitima.categoria}, 'despesa', 'variavel', 'X', 100, -1, 'previsto', '2026-09-18')
      `),
    ).rejects.toThrow()
  })

  it('conciliação não pode apontar para conta de outro usuário', async () => {
    const vitima = await criarUsuario()
    const atacante = await criarUsuario()
    const daVitima = await contaDe(vitima)

    await expect(
      comoUsuario(atacante, (sql) => sql`
        insert into reconciliations
          (user_id, account_id, reported_balance_cents, calculated_balance_cents, decision)
        values (${atacante}, ${daVitima.conta}, 0, 0, 'adiado')
      `),
    ).rejects.toThrow()
  })

  it('subcategoria não pode ficar dentro de categoria de outro usuário', async () => {
    const vitima = await criarUsuario()
    const atacante = await criarUsuario()
    const daVitima = await contaDe(vitima)

    await expect(
      comoUsuario(atacante, (sql) => sql`
        insert into categories (user_id, name, kind, parent_id)
        values (${atacante}, 'Intrusa', 'despesa', ${daVitima.categoria})
      `),
    ).rejects.toThrow()
  })

  it('o caminho legítimo continua funcionando', async () => {
    const dono = await criarUsuario()
    const proprio = await contaDe(dono)

    await comoUsuario(dono, (sql) => sql`
      insert into transactions
        (user_id, account_id, category_id, kind, nature, description, amount_cents, direction, status, competence_date)
      values
        (${dono}, ${proprio.conta}, ${proprio.categoria}, 'despesa', 'variavel', 'X', 100, -1, 'previsto', '2026-09-18')
    `)
  })
})
