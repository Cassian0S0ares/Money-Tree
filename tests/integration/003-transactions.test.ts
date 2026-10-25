import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { comoUsuario, criarUsuario, limparBanco, sqlAdmin } from './helpers'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

async function cenario() {
  const usuario = await criarUsuario()
  const { conta, categoria } = await comoUsuario(usuario, async (sql) => {
    const [conta] = await sql<{ id: string }[]>`
      insert into accounts (user_id, name, type, initial_balance_cents, initial_balance_date)
      values (${usuario}, 'Corrente', 'corrente', 0, '2026-09-01')
      returning id
    `
    const [categoria] = await sql<{ id: string }[]>`
      insert into categories (user_id, name, kind, sort_order)
      values (${usuario}, 'Mercado', 'despesa', 1)
      returning id
    `
    return { conta: conta.id, categoria: categoria.id }
  })
  return { usuario, conta, categoria }
}

function despesa(usuario: string, conta: string, categoria: string) {
  return {
    user_id: usuario,
    account_id: conta,
    category_id: categoria,
    kind: 'despesa',
    nature: 'variavel',
    amount_cents: 5000,
    direction: -1,
    status: 'liquidado',
    description: 'Compra no mercado',
    competence_date: '2026-09-18',
    settled_date: '2026-09-18',
  }
}

describe('migração 003', () => {
  it('signed_amount_cents é gerado a partir de valor e direção', async () => {
    const { usuario, conta, categoria } = await cenario()
    const [linha] = await comoUsuario(usuario, (sql) => sql<{ signed_amount_cents: string }[]>`
      insert into transactions ${sql(despesa(usuario, conta, categoria))}
      returning signed_amount_cents
    `)
    expect(Number(linha.signed_amount_cents)).toBe(-5000)
  })

  it('rejeita valor zero ou negativo', async () => {
    const { usuario, conta, categoria } = await cenario()
    for (const valor of [0, -1]) {
      await expect(
        comoUsuario(usuario, (sql) => sql`
          insert into transactions ${sql({ ...despesa(usuario, conta, categoria), amount_cents: valor })}
        `),
      ).rejects.toThrow()
    }
  })

  it('rejeita despesa com direção positiva', async () => {
    const { usuario, conta, categoria } = await cenario()
    await expect(
      comoUsuario(usuario, (sql) => sql`
        insert into transactions ${sql({ ...despesa(usuario, conta, categoria), direction: 1 })}
      `),
    ).rejects.toThrow()
  })

  it('rejeita liquidado sem data de liquidação', async () => {
    const { usuario, conta, categoria } = await cenario()
    await expect(
      comoUsuario(usuario, (sql) => sql`
        insert into transactions ${sql({ ...despesa(usuario, conta, categoria), settled_date: null })}
      `),
    ).rejects.toThrow()
  })

  it('rejeita transferência sem grupo e transferência com categoria', async () => {
    const { usuario, conta, categoria } = await cenario()
    const transferencia = {
      ...despesa(usuario, conta, categoria),
      kind: 'transferencia',
      nature: null,
      category_id: null,
    }

    await expect(
      comoUsuario(usuario, (sql) => sql`insert into transactions ${sql(transferencia)}`),
    ).rejects.toThrow()

    await expect(
      comoUsuario(usuario, (sql) => sql`
        insert into transactions ${sql({
          ...transferencia,
          transfer_group_id: crypto.randomUUID(),
          category_id: categoria,
        })}
      `),
    ).rejects.toThrow()
  })

  it('rejeita ajuste sem motivo', async () => {
    const { usuario, conta, categoria } = await cenario()
    await expect(
      comoUsuario(usuario, (sql) => sql`
        insert into transactions ${sql({
          ...despesa(usuario, conta, categoria),
          kind: 'ajuste',
          nature: null,
          category_id: null,
        })}
      `),
    ).rejects.toThrow()
  })

  it('rejeita natureza em ajuste', async () => {
    const { usuario, conta, categoria } = await cenario()
    await expect(
      comoUsuario(usuario, (sql) => sql`
        insert into transactions ${sql({
          ...despesa(usuario, conta, categoria),
          kind: 'ajuste',
          category_id: null,
          adjustment_reason: 'divergência',
          nature: 'fixa',
        })}
      `),
    ).rejects.toThrow()
  })

  it('AMEAÇA T11: external_id repetido na mesma origem é rejeitado', async () => {
    const { usuario, conta, categoria } = await cenario()
    const comId = { ...despesa(usuario, conta, categoria), source: 'importacao', external_id: 'ofx-1' }

    await comoUsuario(usuario, (sql) => sql`insert into transactions ${sql(comId)}`)
    await expect(
      comoUsuario(usuario, (sql) => sql`insert into transactions ${sql(comId)}`),
    ).rejects.toThrow()
  })

  it('permite external_id nulo repetido, porque lançamento manual não tem origem externa', async () => {
    const { usuario, conta, categoria } = await cenario()
    await comoUsuario(usuario, async (sql) => {
      await sql`insert into transactions ${sql(despesa(usuario, conta, categoria))}`
      await sql`insert into transactions ${sql(despesa(usuario, conta, categoria))}`
    })
    const linhas = await comoUsuario(usuario, (sql) => sql`select id from transactions`)
    expect(linhas).toHaveLength(2)
  })

  it('AMEAÇA T6: lançamento liquidado não pode ser apagado', async () => {
    const { usuario, conta, categoria } = await cenario()
    const [linha] = await comoUsuario(usuario, (sql) => sql<{ id: string }[]>`
      insert into transactions ${sql(despesa(usuario, conta, categoria))} returning id
    `)

    await expect(
      comoUsuario(usuario, (sql) => sql`delete from transactions where id = ${linha.id}`),
    ).rejects.toThrow(/estorno/i)
  })

  it('lançamento previsto pode ser apagado', async () => {
    const { usuario, conta, categoria } = await cenario()
    const [linha] = await comoUsuario(usuario, (sql) => sql<{ id: string }[]>`
      insert into transactions ${sql({
        ...despesa(usuario, conta, categoria),
        status: 'previsto',
        settled_date: null,
      })} returning id
    `)

    await comoUsuario(usuario, (sql) => sql`delete from transactions where id = ${linha.id}`)
    const restantes = await comoUsuario(usuario, (sql) => sql`select id from transactions`)
    expect(restantes).toHaveLength(0)
  })

  it('um estorno só pode existir uma vez por lançamento original', async () => {
    const { usuario, conta, categoria } = await cenario()
    const ids = await comoUsuario(usuario, async (sql) => {
      const [original] = await sql<{ id: string }[]>`
        insert into transactions ${sql(despesa(usuario, conta, categoria))} returning id
      `
      const [estorno] = await sql<{ id: string }[]>`
        insert into transactions ${sql({
          ...despesa(usuario, conta, categoria),
          direction: 1,
          kind: 'ajuste',
          nature: null,
          category_id: null,
          adjustment_reason: 'estorno',
        })} returning id
      `
      return { original: original.id, estorno: estorno.id }
    })

    await comoUsuario(usuario, (sql) => sql`
      insert into ledger_reversals (user_id, original_transaction_id, reversal_transaction_id, reason)
      values (${usuario}, ${ids.original}, ${ids.estorno}, 'erro de digitação')
    `)

    await expect(
      comoUsuario(usuario, (sql) => sql`
        insert into ledger_reversals (user_id, original_transaction_id, reversal_transaction_id, reason)
        values (${usuario}, ${ids.original}, ${ids.estorno}, 'de novo')
      `),
    ).rejects.toThrow()
  })
})
