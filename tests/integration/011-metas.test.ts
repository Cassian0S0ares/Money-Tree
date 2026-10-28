import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { comoUsuario, criarUsuario, limparBanco, sqlAdmin } from './helpers'
import { listarContasComSaldo } from '../../src/data/accounts'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

type Movimento = 'aporte' | 'resgate' | 'liberacao'

async function conta(usuario: string, nome: string, saldoInicial = 100_000) {
  const [linha] = await comoUsuario(usuario, (sql) => sql<{ id: string }[]>`
    insert into accounts (user_id, name, type, initial_balance_cents, initial_balance_date)
    values (${usuario}, ${nome}, 'corrente', ${saldoInicial}, '2026-09-01')
    returning id
  `)
  return linha.id
}

async function meta(usuario: string, dados: { nome?: string; alvo?: number; conta?: string | null } = {}) {
  const [linha] = await comoUsuario(usuario, (sql) => sql<{ id: string }[]>`
    insert into goals (user_id, name, kind, target_cents, priority, account_id)
    values (
      ${usuario}, ${dados.nome ?? 'Viagem'}, 'viagem', ${dados.alvo ?? 500_000}, 'alta',
      ${dados.conta ?? null}
    )
    returning id
  `)
  return linha.id
}

function mover(usuario: string, metaId: string, contaId: string, kind: Movimento, valor: number) {
  return comoUsuario(usuario, (sql) => sql`
    insert into goal_allocations (user_id, goal_id, account_id, kind, amount_cents, occurred_on)
    values (${usuario}, ${metaId}, ${contaId}, ${kind}, ${valor}, '2026-10-28')
  `)
}

async function cenario(saldoInicial = 100_000) {
  const usuario = await criarUsuario()
  const corrente = await conta(usuario, 'Corrente', saldoInicial)
  const viagem = await meta(usuario)
  return { usuario, corrente, viagem }
}

describe('migração 011: goals', () => {
  it('aceita meta válida, com ou sem conta padrão', async () => {
    const c = await cenario()
    await expect(meta(c.usuario, { conta: c.corrente })).resolves.toBeTruthy()
  })

  it('recusa alvo zero ou negativo', async () => {
    const c = await cenario()
    await expect(meta(c.usuario, { alvo: 0 })).rejects.toThrow()
    await expect(meta(c.usuario, { alvo: -1 })).rejects.toThrow()
  })

  it('nome de 1 a 80 caracteres', async () => {
    const c = await cenario()
    await expect(meta(c.usuario, { nome: '   ' })).rejects.toThrow()
    await expect(meta(c.usuario, { nome: 'x'.repeat(81) })).rejects.toThrow()
    await expect(meta(c.usuario, { nome: 'x'.repeat(80) })).resolves.toBeTruthy()
  })

  it('contribuição planejada, quando existe, é positiva', async () => {
    const c = await cenario()
    const planejar = (valor: number) => comoUsuario(c.usuario, (sql) => sql`
      update goals set monthly_contribution_cents = ${valor} where id = ${c.viagem}
    `)
    await expect(planejar(0)).rejects.toThrow()
    await expect(planejar(20_000)).resolves.toBeTruthy()
  })

  it('AMEAÇA T20: conta padrão de outro usuário é recusada; T3: RLS', async () => {
    const dono = await cenario()
    const intruso = await criarUsuario()

    await expect(meta(intruso, { conta: dono.corrente })).rejects.toThrow()
    const vistas = await comoUsuario(intruso, (sql) => sql`select id from goals`)
    expect(vistas).toHaveLength(0)
  })
})

describe('migração 011: goal_allocations', () => {
  it('AMEAÇA T20: movimento com conta ou meta de outro usuário é recusado; T3: RLS', async () => {
    const dono = await cenario()
    const intruso = await cenario()
    await mover(dono.usuario, dono.viagem, dono.corrente, 'aporte', 10_000)

    await expect(mover(intruso.usuario, intruso.viagem, dono.corrente, 'aporte', 100)).rejects.toThrow()
    await expect(mover(intruso.usuario, dono.viagem, intruso.corrente, 'aporte', 100)).rejects.toThrow()
    const vistos = await comoUsuario(intruso.usuario, (sql) => sql`select id from goal_allocations`)
    expect(vistos).toHaveLength(0)
  })

  it('só inserção: UPDATE e DELETE são recusados para a aplicação', async () => {
    const c = await cenario()
    await mover(c.usuario, c.viagem, c.corrente, 'aporte', 10_000)

    await expect(
      comoUsuario(c.usuario, (sql) => sql`update goal_allocations set amount_cents = 1`),
    ).rejects.toThrow(/permission denied/i)
    await expect(
      comoUsuario(c.usuario, (sql) => sql`delete from goal_allocations`),
    ).rejects.toThrow(/permission denied/i)

    const privilegios = await sqlAdmin<{ privilege_type: string }[]>`
      select privilege_type from information_schema.role_table_grants
      where grantee = 'money_tree_app' and table_name = 'goal_allocations'
    `
    const tipos = privilegios.map((p) => p.privilege_type)
    expect(tipos).not.toContain('UPDATE')
    expect(tipos).not.toContain('DELETE')
  })

  it('sinal incoerente com o tipo é recusado', async () => {
    const c = await cenario()
    await mover(c.usuario, c.viagem, c.corrente, 'aporte', 10_000)

    await expect(mover(c.usuario, c.viagem, c.corrente, 'aporte', -100)).rejects.toThrow()
    await expect(mover(c.usuario, c.viagem, c.corrente, 'aporte', 0)).rejects.toThrow()
    await expect(mover(c.usuario, c.viagem, c.corrente, 'resgate', 100)).rejects.toThrow()
    await expect(mover(c.usuario, c.viagem, c.corrente, 'liberacao', 100)).rejects.toThrow()
  })

  it('aporte acima do não reservado da conta é recusado', async () => {
    const c = await cenario(100_000)
    const carro = await meta(c.usuario, { nome: 'Carro' })

    await mover(c.usuario, c.viagem, c.corrente, 'aporte', 60_000)
    await expect(mover(c.usuario, carro, c.corrente, 'aporte', 40_001)).rejects.toThrow(/sem reserva/i)
    await expect(mover(c.usuario, carro, c.corrente, 'aporte', 40_000)).resolves.toBeTruthy()
  })

  it('reserva de meta concluída ou arquivada não ocupa a conta', async () => {
    const c = await cenario(100_000)
    const carro = await meta(c.usuario, { nome: 'Carro' })
    const casa = await meta(c.usuario, { nome: 'Casa' })

    await mover(c.usuario, c.viagem, c.corrente, 'aporte', 60_000)
    await mover(c.usuario, carro, c.corrente, 'aporte', 40_000)
    await comoUsuario(c.usuario, (sql) => sql`update goals set completed_at = now() where id = ${c.viagem}`)
    await comoUsuario(c.usuario, (sql) => sql`update goals set archived_at = now() where id = ${carro}`)

    await expect(mover(c.usuario, casa, c.corrente, 'aporte', 100_000)).resolves.toBeTruthy()
  })

  it('resgate maior que a reserva da meta naquela conta é recusado', async () => {
    const c = await cenario()
    const poupanca = await conta(c.usuario, 'Poupança')
    await mover(c.usuario, c.viagem, c.corrente, 'aporte', 30_000)
    await mover(c.usuario, c.viagem, poupanca, 'aporte', 30_000)

    await expect(mover(c.usuario, c.viagem, c.corrente, 'resgate', -30_001)).rejects.toThrow(/reservado nesta conta/i)
    await expect(mover(c.usuario, c.viagem, c.corrente, 'liberacao', -30_001)).rejects.toThrow(/reservado nesta conta/i)
    await expect(mover(c.usuario, c.viagem, c.corrente, 'resgate', -30_000)).resolves.toBeTruthy()
    await expect(mover(c.usuario, c.viagem, c.corrente, 'resgate', -1)).rejects.toThrow(/reservado nesta conta/i)
  })

  it('aporte em meta concluída ou arquivada é recusado; liberação passa', async () => {
    const c = await cenario()
    const carro = await meta(c.usuario, { nome: 'Carro' })
    await mover(c.usuario, c.viagem, c.corrente, 'aporte', 10_000)
    await mover(c.usuario, carro, c.corrente, 'aporte', 10_000)

    await comoUsuario(c.usuario, (sql) => sql`update goals set completed_at = now() where id = ${c.viagem}`)
    await comoUsuario(c.usuario, (sql) => sql`update goals set archived_at = now() where id = ${carro}`)

    await expect(mover(c.usuario, c.viagem, c.corrente, 'aporte', 100)).rejects.toThrow(/encerrada/i)
    await expect(mover(c.usuario, carro, c.corrente, 'aporte', 100)).rejects.toThrow(/encerrada/i)
    await expect(mover(c.usuario, c.viagem, c.corrente, 'liberacao', -10_000)).resolves.toBeTruthy()
    await expect(mover(c.usuario, carro, c.corrente, 'liberacao', -10_000)).resolves.toBeTruthy()
  })

  it('aporte em conta arquivada é recusado; resgate e liberação passam', async () => {
    const c = await cenario()
    await mover(c.usuario, c.viagem, c.corrente, 'aporte', 10_000)
    await comoUsuario(c.usuario, (sql) => sql`update accounts set is_archived = true where id = ${c.corrente}`)

    await expect(mover(c.usuario, c.viagem, c.corrente, 'aporte', 100)).rejects.toThrow(/conta arquivada/i)
    await expect(mover(c.usuario, c.viagem, c.corrente, 'resgate', -4_000)).resolves.toBeTruthy()
    await expect(mover(c.usuario, c.viagem, c.corrente, 'liberacao', -6_000)).resolves.toBeTruthy()
  })

  it('o saldo usado no limite é o mesmo que a tela de contas mostra', async () => {
    const c = await cenario(100_000)
    const poupanca = await conta(c.usuario, 'Poupança', 0)

    await comoUsuario(c.usuario, async (sql) => {
      await sql`
        insert into transactions
          (user_id, account_id, kind, nature, description, amount_cents, direction, status,
           competence_date, settled_date, adjustment_reason)
        values
          (${c.usuario}, ${c.corrente}, 'despesa', 'variavel', 'Paga',      5000, -1, 'liquidado',  '2026-09-10', '2026-09-10', null),
          (${c.usuario}, ${c.corrente}, 'despesa', 'variavel', 'Prevista',  9900, -1, 'previsto',   '2026-10-20', null,         null),
          (${c.usuario}, ${c.corrente}, 'despesa', 'variavel', 'Pendente',  1234, -1, 'pendente',   '2026-10-21', null,         null),
          (${c.usuario}, ${c.corrente}, 'despesa', 'variavel', 'Estornada', 7000, -1, 'estornado',  '2026-09-12', '2026-09-12', null),
          (${c.usuario}, ${c.corrente}, 'ajuste',   null,      'Estorno',   7000,  1, 'liquidado',  '2026-09-13', '2026-09-13', 'Cobrança indevida'),
          (${c.usuario}, ${c.corrente}, 'receita',  'fixa',    'Salário',   3000,  1, 'conciliado', '2026-09-05', '2026-09-05', null)
      `
      await sql`
        select create_transfer(
          ${c.usuario}::uuid, ${c.corrente}::uuid, ${poupanca}::uuid, 20000::bigint, 'Para a poupança',
          '2026-09-15'::date, '2026-09-15'::date, 'liquidado'::transaction_status, null::text
        )
      `
    })

    const contas = await listarContasComSaldo(c.usuario)
    const saldo = contas.find((x) => x.id === c.corrente)!.balanceCents
    // 100.000 − 5.000 − 7.000 + 7.000 + 3.000 − 20.000; previsto e pendente não contam.
    expect(saldo).toBe(78_000)

    await expect(mover(c.usuario, c.viagem, c.corrente, 'aporte', saldo + 1)).rejects.toThrow(/sem reserva/i)
    await expect(mover(c.usuario, c.viagem, c.corrente, 'aporte', saldo)).resolves.toBeTruthy()
  })

  it('dois aportes concorrentes que juntos passam do saldo: um falha', async () => {
    const c = await cenario(100_000)
    const carro = await meta(c.usuario, { nome: 'Carro' })

    // Duas conexões de verdade: cada aporte cabe sozinho, os dois juntos não.
    // A pausa antes do commit segura a transação aberta, de modo que, sem a
    // trava na conta, os dois gatilhos leriam as reservas sem ver o outro.
    const url =
      process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:55432/money_tree_test'
    const outra = postgres(url, { prepare: false, onnotice: () => {} })
    // Barreira: nenhum dos dois insere antes de as duas transações estarem
    // abertas. Sem ela, abrir a segunda conexão demora e o teste passaria
    // por sequência, não por trava.
    let chegou = 0
    let liberar: () => void = () => {}
    const largada = new Promise<void>((resolve) => (liberar = resolve))
    const aportar = (cliente: postgres.Sql, metaId: string) =>
      cliente.begin(async (tx) => {
        await tx`set local role money_tree_app`
        await tx`select set_config('app.user_id', ${c.usuario}, true)`
        if (++chegou === 2) liberar()
        await largada
        await tx`
          insert into goal_allocations (user_id, goal_id, account_id, kind, amount_cents, occurred_on)
          values (${c.usuario}, ${metaId}, ${c.corrente}, 'aporte', 60000, '2026-10-28')
        `
        await tx`select pg_sleep(0.3)`
      })

    try {
      const resultados = await Promise.allSettled([aportar(sqlAdmin, c.viagem), aportar(outra, carro)])
      const falhas = resultados.filter((r) => r.status === 'rejected')
      expect(falhas).toHaveLength(1)
      expect(String((falhas[0] as PromiseRejectedResult).reason)).toMatch(/sem reserva/i)
    } finally {
      await outra.end()
    }

    const [total] = await sqlAdmin<{ soma: string }[]>`
      select coalesce(sum(amount_cents), 0)::text as soma from goal_allocations where account_id = ${c.corrente}
    `
    expect(Number(total.soma)).toBe(60_000)
  })
})
