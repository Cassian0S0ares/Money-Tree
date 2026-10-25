import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, limparBanco, sqlAdmin } from './helpers'
import { criarConta, listarContasComSaldo } from '../../src/data/accounts'
import { criarCategoria } from '../../src/data/categories'
import { criarLancamento } from '../../src/data/transactions'
import {
  criarRegra,
  editarDestaEmDiante,
  editarOcorrencia,
  encerrarRegra,
  garantirOcorrencias,
  listarRegras,
  ocorrenciasDaRegra,
  pagarOcorrencia,
  pausarRegra,
  proximasContas,
  pularOcorrencia,
  retomarRegra,
  type NovaRegra,
} from '../../src/data/recurrences'
import { isoDate } from '../../src/domain/dates'
import { cents } from '../../src/domain/money'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

const HOJE = isoDate('2026-10-25')

async function cenario(extra: Partial<NovaRegra> = {}) {
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
  const regra = await criarRegra(
    usuario,
    {
      kind: 'despesa', description: 'Aluguel', accountId: corrente.id, categoryId: moradia.id,
      nature: 'fixa', amountCents: cents(150_000), unit: 'mes', interval: 1,
      startDate: isoDate('2026-11-05'), ...extra,
      ...(extra.kind === 'transferencia' ? { toAccountId: poupanca.id } : {}),
    },
    { hoje: HOJE },
  )
  await garantirOcorrencias(usuario, HOJE)
  const lista = await ocorrenciasDaRegra(usuario, regra.id)
  return { usuario, corrente, poupanca, moradia, regra, lista }
}

const datas = (lista: { occurrenceDate: string | null; status: string }[]) =>
  lista.map((o) => `${o.occurrenceDate} ${o.status}`)

describe('pular', () => {
  it('cancela a ocorrência, e gerar de novo não a recria', async () => {
    const c = await cenario()
    await pularOcorrencia(c.usuario, c.lista[1].id)

    await sqlAdmin`update recurrence_rules set generated_until = null`
    await garantirOcorrencias(c.usuario, HOJE)

    expect(datas(await ocorrenciasDaRegra(c.usuario, c.regra.id))).toEqual([
      '2026-11-05 previsto', '2026-12-05 cancelado', '2027-01-05 previsto',
    ])
  })
})

describe('editar só esta', () => {
  it('muda a ocorrência e a marca como exceção', async () => {
    const c = await cenario()
    const editada = await editarOcorrencia(c.usuario, c.lista[0].id, {
      amountCents: cents(160_000), dueDate: isoDate('2026-11-07'),
    })

    expect(editada).toMatchObject({ amountCents: 160_000, dueDate: '2026-11-07', isException: true })
  })

  it('ocorrência paga não é editável: resta estornar', async () => {
    const c = await cenario()
    await pagarOcorrencia(c.usuario, c.lista[0].id, { valor: cents(150_000), quando: isoDate('2026-11-05') })

    await expect(
      editarOcorrencia(c.usuario, c.lista[0].id, { amountCents: cents(1) }),
    ).rejects.toThrow(/estorno/i)
  })
})

describe('AMEAÇA T19: desta em diante', () => {
  it('divide a regra e só substitui o que não foi tocado', async () => {
    const c = await cenario()
    // Novembro pago, dezembro pulado, janeiro editado sozinho.
    await pagarOcorrencia(c.usuario, c.lista[0].id, { valor: cents(150_000), quando: isoDate('2026-11-05') })
    await pularOcorrencia(c.usuario, c.lista[1].id)
    await editarOcorrencia(c.usuario, c.lista[2].id, { description: 'Aluguel com desconto' })

    await garantirOcorrencias(c.usuario, isoDate('2026-11-10')) // gera fevereiro
    const fevereiro = (await ocorrenciasDaRegra(c.usuario, c.regra.id)).find(
      (o) => o.occurrenceDate === '2027-02-05',
    )!

    await editarDestaEmDiante(c.usuario, c.lista[1].id, { amountCents: cents(170_000) }, isoDate('2026-11-10'))
    await garantirOcorrencias(c.usuario, isoDate('2026-11-10'))

    const todas = await sqlAdmin<{ occurrence_date: Date; status: string; amount_cents: string; description: string }[]>`
      select occurrence_date, status, amount_cents, description from transactions
      where recurrence_series_id = ${c.regra.seriesId}
      order by occurrence_date
    `
    expect(
      todas.map((t) => [t.occurrence_date.toISOString().slice(0, 10), t.status, Number(t.amount_cents), t.description]),
    ).toEqual([
      ['2026-11-05', 'liquidado', 150_000, 'Aluguel'],
      // Pulada continua pulada: a regra nova não a ressuscita.
      ['2026-12-05', 'cancelado', 150_000, 'Aluguel'],
      ['2027-01-05', 'previsto', 150_000, 'Aluguel com desconto'],
      ['2027-02-05', 'previsto', 170_000, 'Aluguel'],
    ])
    expect(fevereiro).toBeTruthy()

    const regras = await listarRegras(c.usuario)
    expect(regras).toHaveLength(2)
    const antiga = regras.find((r) => r.id === c.regra.id)!
    expect(antiga.endDate).toBe('2026-12-04')
  })

  it('a partir da primeira ocorrência, troca a regra no lugar', async () => {
    const c = await cenario()
    await editarDestaEmDiante(c.usuario, c.lista[0].id, { amountCents: cents(140_000) }, HOJE)
    await garantirOcorrencias(c.usuario, HOJE)

    expect(await listarRegras(c.usuario)).toHaveLength(1)
    const lista = await ocorrenciasDaRegra(c.usuario, c.regra.id)
    expect(lista.map((o) => o.amountCents)).toEqual([140_000, 140_000, 140_000])
  })

  it('"12 vezes" continua sendo 12 no total depois da divisão', async () => {
    const c = await cenario({ maxOccurrences: 12 })
    await editarDestaEmDiante(c.usuario, c.lista[2].id, { amountCents: cents(1) }, HOJE)

    const nova = (await listarRegras(c.usuario)).find((r) => r.id !== c.regra.id)!
    expect(nova.maxOccurrences).toBe(10)
  })
})

describe('pausar, retomar, encerrar', () => {
  it('pausar apaga as futuras não tocadas; retomar gera de hoje, sem preencher a pausa', async () => {
    const c = await cenario()
    await pagarOcorrencia(c.usuario, c.lista[0].id, { valor: cents(150_000), quando: isoDate('2026-11-05') })

    await pausarRegra(c.usuario, c.regra.id, isoDate('2026-11-06'))
    expect(datas(await ocorrenciasDaRegra(c.usuario, c.regra.id))).toEqual(['2026-11-05 liquidado'])

    await garantirOcorrencias(c.usuario, isoDate('2027-01-20'))
    expect(await ocorrenciasDaRegra(c.usuario, c.regra.id)).toHaveLength(1)

    await retomarRegra(c.usuario, c.regra.id, isoDate('2027-01-20'))
    await garantirOcorrencias(c.usuario, isoDate('2027-01-20'))

    const depois = (await ocorrenciasDaRegra(c.usuario, c.regra.id)).map((o) => o.occurrenceDate)
    // Dezembro e janeiro ficaram dentro da pausa e não voltam.
    expect(depois).toEqual(['2026-11-05', '2027-02-05', '2027-03-05', '2027-04-05'])
  })

  it('encerrar mantém a regra e o histórico, e para de gerar', async () => {
    const c = await cenario()
    await pagarOcorrencia(c.usuario, c.lista[0].id, { valor: cents(150_000), quando: isoDate('2026-11-05') })
    await encerrarRegra(c.usuario, c.regra.id, isoDate('2026-11-06'))
    await garantirOcorrencias(c.usuario, isoDate('2027-06-01'))

    const [regra] = await listarRegras(c.usuario)
    expect(regra.status).toBe('encerrada')
    expect(datas(await ocorrenciasDaRegra(c.usuario, c.regra.id))).toEqual(['2026-11-05 liquidado'])
  })
})

describe('pagar ocorrência', () => {
  it('grava o valor real da conta estimada e move o saldo', async () => {
    const c = await cenario({ description: 'Luz', amountCents: cents(20_000), amountIsEstimate: true })

    await pagarOcorrencia(c.usuario, c.lista[0].id, { valor: cents(23_190), quando: isoDate('2026-11-06') })

    const [paga] = await ocorrenciasDaRegra(c.usuario, c.regra.id)
    expect(paga).toMatchObject({ status: 'liquidado', amountCents: 23_190, settledDate: '2026-11-06' })
    const [conta] = (await listarContasComSaldo(c.usuario)).filter((x) => x.id === c.corrente.id)
    expect(conta.balanceCents).toBe(500_000 - 23_190)
  })

  it('avisa quando o valor foge mais de 25% da mediana dos três últimos', async () => {
    const c = await cenario({
      description: 'Luz', amountCents: cents(20_000), amountIsEstimate: true,
      unit: 'semana', startDate: isoDate('2026-10-26'),
    })
    const [a, b, d, e] = c.lista
    expect((await pagarOcorrencia(c.usuario, a.id, { valor: cents(20_000), quando: HOJE })).aviso).toBeNull()
    await pagarOcorrencia(c.usuario, b.id, { valor: cents(21_000), quando: HOJE })
    await pagarOcorrencia(c.usuario, d.id, { valor: cents(19_500), quando: HOJE })

    const { aviso } = await pagarOcorrencia(c.usuario, e.id, { valor: cents(26_000), quando: HOJE })
    expect(aviso).toEqual({ percentual: 30, mediana: 20_000, sentido: 'acima' })
  })

  it('transferência recorrente se paga pelos dois lados', async () => {
    const c = await cenario({
      kind: 'transferencia', description: 'Reserva', categoryId: null, nature: null,
      amountCents: cents(50_000), weekendPolicy: 'manter',
    })
    const total = async () =>
      (await listarContasComSaldo(c.usuario)).reduce((soma, x) => soma + x.balanceCents, 0)
    const antes = await total()
    c.lista = await ocorrenciasDaRegra(c.usuario, c.regra.id)

    // Usa o id do lado de destino, para provar que qualquer lado serve.
    const destino = c.lista.find((o) => o.direction === 1 && o.occurrenceDate === '2026-11-05')!
    await pagarOcorrencia(c.usuario, destino.id, { valor: cents(50_000), quando: isoDate('2026-11-05') })

    const pagas = (await ocorrenciasDaRegra(c.usuario, c.regra.id)).filter((o) => o.status === 'liquidado')
    expect(pagas).toHaveLength(2)
    expect(await total()).toBe(antes)
  })
})

describe('proximasContas', () => {
  it('atrasadas primeiro, depois por vencimento; somas separadas, sem transferência', async () => {
    const c = await cenario()
    await criarRegra(
      c.usuario,
      {
        kind: 'receita', description: 'Salário', accountId: c.corrente.id, nature: 'fixa',
        amountCents: cents(800_000), unit: 'mes', interval: 1, startDate: isoDate('2026-11-01'),
      },
      { hoje: HOJE },
    )
    await criarRegra(
      c.usuario,
      {
        kind: 'transferencia', description: 'Reserva', accountId: c.corrente.id, toAccountId: c.poupanca.id,
        amountCents: cents(50_000), unit: 'mes', interval: 1, startDate: isoDate('2026-11-02'),
      },
      { hoje: HOJE },
    )
    await criarLancamento(c.usuario, {
      accountId: c.corrente.id, categoryId: c.moradia.id, kind: 'despesa', nature: 'variavel',
      description: 'Conta esquecida', amountCents: cents(9_900), status: 'previsto',
      competenceDate: isoDate('2026-10-20'),
    })
    await garantirOcorrencias(c.usuario, HOJE)

    const proximas = await proximasContas(c.usuario, HOJE, 30)

    expect(proximas.itens.map((i) => [i.description, i.atrasado])).toEqual([
      ['Conta esquecida', true],
      ['Salário', false],
      ['Reserva', false],
      ['Reserva', false],
      ['Aluguel', false],
    ])
    expect(proximas.aPagar).toBe(150_000 + 9_900)
    expect(proximas.aReceber).toBe(800_000)
  })

  it('marca como estimada a ocorrência de valor variável', async () => {
    const c = await cenario({ description: 'Luz', amountIsEstimate: true })
    const proximas = await proximasContas(c.usuario, HOJE, 30)
    expect(proximas.itens[0].estimado).toBe(true)
  })
})
