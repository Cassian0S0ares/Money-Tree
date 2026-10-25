import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, limparBanco, sqlAdmin } from './helpers'
import { criarConta, listarContasComSaldo } from '../../src/data/accounts'
import { criarCategoria } from '../../src/data/categories'
import { listarLancamentos } from '../../src/data/transactions'
import {
  LimiteRecorrenciaError,
  criarRegra,
  garantirOcorrencias,
  listarRegras,
  ocorrenciasDaRegra,
  type NovaRegra,
} from '../../src/data/recurrences'
import { isoDate } from '../../src/domain/dates'
import { cents } from '../../src/domain/money'
import { RegraInvalidaError } from '../../src/domain/recurrence'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

const HOJE = isoDate('2026-10-25')

async function cenario() {
  const usuario = await criarUsuario()
  const corrente = await criarConta(usuario, {
    name: 'Corrente', type: 'corrente',
    initialBalanceCents: cents(500_000), initialBalanceDate: isoDate('2026-09-01'),
  })
  const poupanca = await criarConta(usuario, {
    name: 'Poupança', type: 'poupanca',
    initialBalanceCents: cents(0), initialBalanceDate: isoDate('2026-09-01'),
  })
  const moradia = await criarCategoria(usuario, { name: 'Moradia', kind: 'despesa' })
  const aluguel: NovaRegra = {
    kind: 'despesa',
    description: 'Aluguel',
    accountId: corrente.id,
    categoryId: moradia.id,
    nature: 'fixa',
    amountCents: cents(150_000),
    unit: 'mes',
    interval: 1,
    startDate: isoDate('2026-11-05'),
  }
  return { usuario, corrente, poupanca, moradia, aluguel }
}

async function contarOcorrencias() {
  const [linha] = await sqlAdmin<{ total: string }[]>`
    select count(*)::text as total from transactions where recurrence_rule_id is not null
  `
  return Number(linha.total)
}

describe('criarRegra', () => {
  it('aplica os padrões: dia do mês do início e fim de semana conforme o tipo', async () => {
    const c = await cenario()
    const despesa = await criarRegra(c.usuario, c.aluguel, { hoje: HOJE })
    const receita = await criarRegra(
      c.usuario,
      { ...c.aluguel, kind: 'receita', categoryId: null, description: 'Salário' },
      { hoje: HOJE },
    )

    expect(despesa.dayOfMonth).toBe(5)
    // Boleto de sábado se paga na segunda; salário de sábado não se promete para segunda.
    expect(despesa.weekendPolicy).toBe('proximo_dia_util')
    expect(receita.weekendPolicy).toBe('manter')
  })

  it('recusa regra inválida pelo domínio, antes do banco', async () => {
    const c = await cenario()
    await expect(
      criarRegra(c.usuario, { ...c.aluguel, interval: 0 }, { hoje: HOJE }),
    ).rejects.toThrow(RegraInvalidaError)
  })

  it('primeira ocorrência até 60 dias no passado; mais que isso é recusado', async () => {
    const c = await cenario()
    await expect(
      criarRegra(c.usuario, { ...c.aluguel, startDate: isoDate('2026-08-26') }, { hoje: HOJE }),
    ).resolves.toBeTruthy()
    await expect(
      criarRegra(c.usuario, { ...c.aluguel, startDate: isoDate('2026-08-25') }, { hoje: HOJE }),
    ).rejects.toThrow(RegraInvalidaError)
  })

  it('o lançamento que deu origem à regra vira a primeira ocorrência, mesmo já pago', async () => {
    const c = await cenario()
    const regra = await criarRegra(
      c.usuario,
      { ...c.aluguel, startDate: isoDate('2026-10-05') },
      { hoje: HOJE, primeira: { status: 'liquidado', settledDate: isoDate('2026-10-05') } },
    )
    await garantirOcorrencias(c.usuario, HOJE)

    const lista = await ocorrenciasDaRegra(c.usuario, regra.id)
    expect(lista[0]).toMatchObject({ occurrenceDate: '2026-10-05', status: 'liquidado' })
    // Não nasce uma segunda ocorrência em 05/10.
    expect(lista.filter((o) => o.occurrenceDate === '2026-10-05')).toHaveLength(1)
  })

  it('AMEAÇA T18: no máximo 200 regras ativas', async () => {
    const c = await cenario()
    await sqlAdmin`
      insert into recurrence_rules
        (user_id, kind, description, account_id, category_id, nature, amount_cents, unit, start_date, day_of_month)
      select ${c.usuario}, 'despesa', 'R', ${c.corrente.id}, ${c.moradia.id}, 'fixa', 100, 'mes', '2026-11-05', 5
      from generate_series(1, 200)
    `
    await expect(criarRegra(c.usuario, c.aluguel, { hoje: HOJE })).rejects.toThrow(LimiteRecorrenciaError)
  })
})

describe('garantirOcorrencias', () => {
  it('gera previstas até 90 dias à frente, com vencimento ajustado', async () => {
    const c = await cenario()
    const regra = await criarRegra(c.usuario, c.aluguel, { hoje: HOJE })

    await garantirOcorrencias(c.usuario, HOJE)

    const lista = await ocorrenciasDaRegra(c.usuario, regra.id)
    // 25/10 + 90 dias = 23/01: novembro, dezembro e janeiro.
    expect(lista.map((o) => o.occurrenceDate)).toEqual(['2026-11-05', '2026-12-05', '2027-01-05'])
    expect(lista.every((o) => o.status === 'previsto')).toBe(true)
    expect(lista.every((o) => o.amountCents === 150_000 && o.description === 'Aluguel')).toBe(true)
  })

  it('AMEAÇA T17: chamadas repetidas e simultâneas não duplicam', async () => {
    const c = await cenario()
    await criarRegra(c.usuario, c.aluguel, { hoje: HOJE })

    await Promise.all([
      garantirOcorrencias(c.usuario, HOJE),
      garantirOcorrencias(c.usuario, HOJE),
      garantirOcorrencias(c.usuario, HOJE),
    ])
    await garantirOcorrencias(c.usuario, HOJE)

    expect(await contarOcorrencias()).toBe(3)
  })

  it('com a regra em dia, não grava nada; dias depois, gera só o que falta', async () => {
    const c = await cenario()
    const regra = await criarRegra(c.usuario, c.aluguel, { hoje: HOJE })
    await garantirOcorrencias(c.usuario, HOJE)

    expect(await garantirOcorrencias(c.usuario, HOJE)).toBe(0)

    await garantirOcorrencias(c.usuario, isoDate('2026-11-10'))
    const lista = await ocorrenciasDaRegra(c.usuario, regra.id)
    expect(lista.at(-1)?.occurrenceDate).toBe('2027-02-05')
  })

  it('gerar ocorrências nunca muda o saldo', async () => {
    const c = await cenario()
    const antes = await listarContasComSaldo(c.usuario)
    await criarRegra(c.usuario, c.aluguel, { hoje: HOJE })
    await garantirOcorrencias(c.usuario, HOJE)

    expect(await listarContasComSaldo(c.usuario)).toEqual(antes)
  })

  it('transferência recorrente gera os dois lados de cada data', async () => {
    const c = await cenario()
    await criarRegra(
      c.usuario,
      {
        kind: 'transferencia', description: 'Reserva', accountId: c.corrente.id, toAccountId: c.poupanca.id,
        amountCents: cents(50_000), unit: 'mes', interval: 1, startDate: isoDate('2026-11-10'),
      },
      { hoje: HOJE },
    )
    await garantirOcorrencias(c.usuario, HOJE)

    const { itens } = await listarLancamentos(c.usuario, {})
    expect(itens).toHaveLength(6)
    const grupos = new Set(itens.map((i) => i.transferGroupId))
    expect(grupos.size).toBe(3)
    expect(itens.every((i) => i.kind === 'transferencia' && i.status === 'previsto')).toBe(true)
  })

  it('transferência: repetir a geração não duplica nem quebra', async () => {
    const c = await cenario()
    await criarRegra(
      c.usuario,
      {
        kind: 'transferencia', description: 'Reserva', accountId: c.corrente.id, toAccountId: c.poupanca.id,
        amountCents: cents(50_000), unit: 'mes', interval: 1, startDate: isoDate('2026-11-10'),
      },
      { hoje: HOJE },
    )
    await Promise.all([garantirOcorrencias(c.usuario, HOJE), garantirOcorrencias(c.usuario, HOJE)])
    await sqlAdmin`update recurrence_rules set generated_until = null`
    await garantirOcorrencias(c.usuario, HOJE)

    expect(await contarOcorrencias()).toBe(6)
  })

  it('AMEAÇA T18: uma chamada gera no máximo 1.000 ocorrências e continua na próxima', async () => {
    const c = await cenario()
    // 12 regras diárias: 12 × 91 = 1.092 ocorrências no horizonte.
    for (let i = 0; i < 12; i++) {
      await criarRegra(
        c.usuario,
        { ...c.aluguel, description: `Diária ${i}`, unit: 'dia', startDate: HOJE },
        { hoje: HOJE },
      )
    }

    expect(await garantirOcorrencias(c.usuario, HOJE)).toBe(1_000)
    expect(await garantirOcorrencias(c.usuario, HOJE)).toBe(92)
    expect(await contarOcorrencias()).toBe(1_092)
  })

  it('regra pausada ou encerrada não gera', async () => {
    const c = await cenario()
    const regra = await criarRegra(c.usuario, c.aluguel, { hoje: HOJE })
    await sqlAdmin`update recurrence_rules set status = 'pausada', paused_at = '2026-10-25' where id = ${regra.id}`

    await garantirOcorrencias(c.usuario, HOJE)
    expect(await contarOcorrencias()).toBe(0)
  })
})

describe('listarRegras', () => {
  it('traz a próxima ocorrência em aberto', async () => {
    const c = await cenario()
    await criarRegra(c.usuario, c.aluguel, { hoje: HOJE })
    await garantirOcorrencias(c.usuario, HOJE)

    const [regra] = await listarRegras(c.usuario)
    expect(regra.proximoVencimento).toBe('2026-11-05')
  })
})
