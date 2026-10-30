import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, limparBanco, sqlAdmin } from './helpers'
import { criarConta } from '../../src/data/accounts'
import { criarLancamento } from '../../src/data/transactions'
import {
  ReservaRecusadaError,
  alterarMeta,
  aportar,
  arquivarMeta,
  buscarMeta,
  concluirMeta,
  criarMeta,
  listarMetas,
  naoReservado,
  resgatar,
  reservasPorConta,
  type DadosMeta,
} from '../../src/data/goals'
import { reservaParaDesconto } from '../../src/domain/goal'
import { isoDate } from '../../src/domain/dates'
import { cents } from '../../src/domain/money'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

const HOJE = isoDate('2026-10-15')
const DIA_INICIO = 1

async function cenario() {
  const usuario = await criarUsuario()
  const conta = await criarConta(usuario, {
    name: 'Corrente',
    type: 'corrente',
    initialBalanceCents: cents(1_000_000),
    initialBalanceDate: isoDate('2026-01-01'),
  })
  const poupanca = await criarConta(usuario, {
    name: 'Poupança',
    type: 'poupanca',
    initialBalanceCents: cents(1_000_000),
    initialBalanceDate: isoDate('2026-01-01'),
  })
  return { usuario, conta, poupanca }
}

const dadosMeta = (sobrescreve: Partial<DadosMeta> = {}): DadosMeta => ({
  name: 'Viagem',
  kind: 'viagem',
  targetCents: cents(1_000_000),
  targetDate: null,
  priority: 'media',
  accountId: null,
  monthlyContributionCents: null,
  ...sobrescreve,
})

describe('criar, alterar e buscar', () => {
  it('cria a meta e devolve o detalhe com avaliação e movimentos', async () => {
    const c = await cenario()
    const meta = await criarMeta(c.usuario, dadosMeta({ accountId: c.conta.id }))

    const detalhe = await buscarMeta(c.usuario, meta.id, HOJE, DIA_INICIO)
    expect(detalhe).not.toBeNull()
    expect(detalhe!.meta).toMatchObject({ id: meta.id, reservado: 0, completedAt: null, archivedAt: null })
    expect(detalhe!.movimentos).toHaveLength(0)
  })

  it('alterarMeta muda os dados; recusa numa meta encerrada', async () => {
    const c = await cenario()
    const meta = await criarMeta(c.usuario, dadosMeta())
    await alterarMeta(c.usuario, meta.id, dadosMeta({ name: 'Viagem para a praia' }))

    const detalhe = await buscarMeta(c.usuario, meta.id, HOJE, DIA_INICIO)
    expect(detalhe!.meta.name).toBe('Viagem para a praia')

    await concluirMeta(c.usuario, meta.id, HOJE)
    await expect(alterarMeta(c.usuario, meta.id, dadosMeta({ name: 'Outra' }))).rejects.toThrow()
  })
})

describe('aportar e resgatar', () => {
  it('aporte soma e resgate subtrai o reservado', async () => {
    const c = await cenario()
    const meta = await criarMeta(c.usuario, dadosMeta())

    await aportar(c.usuario, meta.id, { accountId: c.conta.id, amountCents: cents(10_000), occurredOn: HOJE })
    let detalhe = await buscarMeta(c.usuario, meta.id, HOJE, DIA_INICIO)
    expect(detalhe!.meta.reservado).toBe(10_000)

    await resgatar(c.usuario, meta.id, { accountId: c.conta.id, amountCents: cents(4_000), occurredOn: HOJE })
    detalhe = await buscarMeta(c.usuario, meta.id, HOJE, DIA_INICIO)
    expect(detalhe!.meta.reservado).toBe(6_000)

    const movimentos = detalhe!.movimentos
    expect(movimentos).toHaveLength(2)
    expect(movimentos[0]).toMatchObject({ kind: 'aporte', amountCents: 10_000, accountName: 'Corrente' })
    expect(movimentos[1]).toMatchObject({ kind: 'resgate', amountCents: -4_000 })
  })

  it('resgatar e aportar recusam valor zero ou negativo antes do banco', async () => {
    const c = await cenario()
    const meta = await criarMeta(c.usuario, dadosMeta())

    await expect(
      aportar(c.usuario, meta.id, { accountId: c.conta.id, amountCents: cents(0), occurredOn: HOJE }),
    ).rejects.toThrow()
    await expect(
      resgatar(c.usuario, meta.id, { accountId: c.conta.id, amountCents: cents(-10), occurredOn: HOJE }),
    ).rejects.toThrow()
  })
})

describe('erros do gatilho viram ReservaRecusadaError', () => {
  it('aporte acima do não reservado: motivo "saldo" com o disponível correto', async () => {
    const c = await cenario()
    const meta = await criarMeta(c.usuario, dadosMeta())

    await aportar(c.usuario, meta.id, { accountId: c.conta.id, amountCents: cents(1_000_000), occurredOn: HOJE })

    await expect(
      aportar(c.usuario, meta.id, { accountId: c.conta.id, amountCents: cents(1), occurredOn: HOJE }),
    ).rejects.toMatchObject({ motivo: 'saldo', disponivel: 0 })

    try {
      await aportar(c.usuario, meta.id, { accountId: c.conta.id, amountCents: cents(1), occurredOn: HOJE })
      expect.unreachable()
    } catch (erro) {
      expect(erro).toBeInstanceOf(ReservaRecusadaError)
    }
  })

  it('resgate acima do reservado nesta conta: motivo "reserva" com o disponível correto', async () => {
    const c = await cenario()
    const meta = await criarMeta(c.usuario, dadosMeta())
    await aportar(c.usuario, meta.id, { accountId: c.conta.id, amountCents: cents(10_000), occurredOn: HOJE })

    await expect(
      resgatar(c.usuario, meta.id, { accountId: c.conta.id, amountCents: cents(15_000), occurredOn: HOJE }),
    ).rejects.toMatchObject({ motivo: 'reserva', disponivel: 10_000 })
  })

  it('aporte em meta concluída ou arquivada: motivo "encerrada", disponível nulo', async () => {
    const c = await cenario()
    const concluida = await criarMeta(c.usuario, dadosMeta({ name: 'Concluída' }))
    await concluirMeta(c.usuario, concluida.id, HOJE)
    await expect(
      aportar(c.usuario, concluida.id, { accountId: c.conta.id, amountCents: cents(100), occurredOn: HOJE }),
    ).rejects.toMatchObject({ motivo: 'encerrada', disponivel: null })

    const arquivada = await criarMeta(c.usuario, dadosMeta({ name: 'Arquivada' }))
    await arquivarMeta(c.usuario, arquivada.id, HOJE)
    await expect(
      aportar(c.usuario, arquivada.id, { accountId: c.conta.id, amountCents: cents(100), occurredOn: HOJE }),
    ).rejects.toMatchObject({ motivo: 'encerrada', disponivel: null })
  })

  it('aporte em conta arquivada: motivo "encerrada"', async () => {
    const c = await cenario()
    const meta = await criarMeta(c.usuario, dadosMeta())
    const { arquivarConta } = await import('../../src/data/accounts')
    await arquivarConta(c.usuario, c.conta.id)

    await expect(
      aportar(c.usuario, meta.id, { accountId: c.conta.id, amountCents: cents(100), occurredOn: HOJE }),
    ).rejects.toMatchObject({ motivo: 'encerrada', disponivel: null })
  })
})

describe('concluir e arquivar', () => {
  it('zeram a reserva, em cada conta, e preservam o histórico', async () => {
    const c = await cenario()
    const meta = await criarMeta(c.usuario, dadosMeta())
    await aportar(c.usuario, meta.id, { accountId: c.conta.id, amountCents: cents(5_000), occurredOn: isoDate('2026-10-01') })
    await aportar(c.usuario, meta.id, { accountId: c.poupanca.id, amountCents: cents(3_000), occurredOn: isoDate('2026-10-02') })

    await concluirMeta(c.usuario, meta.id, HOJE)

    const detalhe = await buscarMeta(c.usuario, meta.id, HOJE, DIA_INICIO)
    expect(detalhe!.meta.reservado).toBe(0)
    expect(detalhe!.meta.reservasPorConta).toHaveLength(0)
    expect(detalhe!.meta.completedAt).not.toBeNull()

    // Histórico preservado: os dois aportes e as duas liberações continuam lá.
    expect(detalhe!.movimentos).toHaveLength(4)
    const liberacoes = detalhe!.movimentos.filter((m) => m.kind === 'liberacao')
    expect(liberacoes).toHaveLength(2)
    expect(liberacoes.map((l) => l.amountCents).sort((a, b) => a - b)).toEqual([-5_000, -3_000].sort((a, b) => a - b))

    // Já encerrada: concluir de novo é recusado.
    await expect(concluirMeta(c.usuario, meta.id, HOJE)).rejects.toThrow()
  })

  it('arquivar também libera a reserva e marca archivedAt', async () => {
    const c = await cenario()
    const meta = await criarMeta(c.usuario, dadosMeta())
    await aportar(c.usuario, meta.id, { accountId: c.conta.id, amountCents: cents(2_000), occurredOn: HOJE })

    await arquivarMeta(c.usuario, meta.id, HOJE)

    const detalhe = await buscarMeta(c.usuario, meta.id, HOJE, DIA_INICIO)
    expect(detalhe!.meta.reservado).toBe(0)
    expect(detalhe!.meta.archivedAt).not.toBeNull()
  })

  it('meta sem reserva não gera liberação ao concluir', async () => {
    const c = await cenario()
    const meta = await criarMeta(c.usuario, dadosMeta())
    await concluirMeta(c.usuario, meta.id, HOJE)

    const detalhe = await buscarMeta(c.usuario, meta.id, HOJE, DIA_INICIO)
    expect(detalhe!.movimentos).toHaveLength(0)
  })
})

describe('reservas por conta e desconto no dinheiro livre (spec 6.6)', () => {
  it('reserva em conta excluída do disponível não entra em reservaParaDesconto', async () => {
    const c = await cenario()
    const segregada = await criarConta(c.usuario, {
      name: 'Cofrinho',
      type: 'poupanca',
      initialBalanceCents: cents(100_000),
      initialBalanceDate: isoDate('2026-01-01'),
      includeInAvailable: false,
    })
    const meta = await criarMeta(c.usuario, dadosMeta())
    await aportar(c.usuario, meta.id, { accountId: segregada.id, amountCents: cents(50_000), occurredOn: HOJE })
    await aportar(c.usuario, meta.id, { accountId: c.conta.id, amountCents: cents(20_000), occurredOn: HOJE })

    const reservas = await reservasPorConta(c.usuario)
    expect(reservas.get(segregada.id)).toBe(50_000)
    expect(reservas.get(c.conta.id)).toBe(20_000)

    const contas = [
      { id: segregada.id, includeInAvailable: false },
      { id: c.conta.id, includeInAvailable: true },
    ]
    expect(reservaParaDesconto(reservas, contas)).toBe(20_000)
  })

  it('reservasPorConta ignora metas encerradas e omite contas com soma zero', async () => {
    const c = await cenario()
    const metaEncerrada = await criarMeta(c.usuario, dadosMeta({ name: 'Encerrada' }))
    await aportar(c.usuario, metaEncerrada.id, { accountId: c.conta.id, amountCents: cents(1_000), occurredOn: HOJE })
    await concluirMeta(c.usuario, metaEncerrada.id, HOJE)

    const ativa = await criarMeta(c.usuario, dadosMeta({ name: 'Ativa' }))
    await aportar(c.usuario, ativa.id, { accountId: c.poupanca.id, amountCents: cents(500), occurredOn: HOJE })

    const reservas = await reservasPorConta(c.usuario)
    expect(reservas.has(c.conta.id)).toBe(false)
    expect(reservas.get(c.poupanca.id)).toBe(500)
  })
})

describe('reserva acima do saldo (spec 3.3)', () => {
  it('despesa paga depois do aporte gera acimaDoSaldo > 0 sem apagar a reserva', async () => {
    const c = await cenario()
    const meta = await criarMeta(c.usuario, dadosMeta())
    await aportar(c.usuario, meta.id, { accountId: c.conta.id, amountCents: cents(800_000), occurredOn: isoDate('2026-10-01') })

    const antes = await buscarMeta(c.usuario, meta.id, HOJE, DIA_INICIO)
    expect(antes!.meta.reservasPorConta[0]).toMatchObject({ reservado: 800_000, acimaDoSaldo: 0 })

    const { criarCategoria } = await import('../../src/data/categories')
    const categoria = await criarCategoria(c.usuario, { name: 'Despesa', kind: 'despesa' })
    await criarLancamento(c.usuario, {
      accountId: c.conta.id,
      categoryId: categoria.id,
      kind: 'despesa',
      nature: 'variavel',
      description: 'Conta grande',
      amountCents: cents(500_000),
      status: 'liquidado',
      competenceDate: isoDate('2026-10-10'),
      settledDate: isoDate('2026-10-10'),
    })

    const depois = await buscarMeta(c.usuario, meta.id, HOJE, DIA_INICIO)
    // saldo caiu para 1.000.000 - 500.000 = 500.000; reserva de 800.000 fica 300.000 acima.
    expect(depois!.meta.reservado).toBe(800_000)
    expect(depois!.meta.reservasPorConta[0]).toMatchObject({ reservado: 800_000, acimaDoSaldo: 300_000 })

    expect(await naoReservado(c.usuario, c.conta.id)).toBe(-300_000)
  })
})

describe('ritmo pela média usa movimentos do banco (spec 6.3)', () => {
  it('calcula a média líquida dos três últimos meses financeiros completos', async () => {
    const c = await cenario()
    const meta = await criarMeta(c.usuario, dadosMeta({ targetCents: cents(10_000_000) }))

    await aportar(c.usuario, meta.id, { accountId: c.conta.id, amountCents: cents(30_000), occurredOn: isoDate('2026-07-10') })
    await aportar(c.usuario, meta.id, { accountId: c.conta.id, amountCents: cents(30_000), occurredOn: isoDate('2026-08-10') })
    await aportar(c.usuario, meta.id, { accountId: c.conta.id, amountCents: cents(30_000), occurredOn: isoDate('2026-09-10') })
    // Fora da janela (mês corrente): não deveria entrar na média.
    await aportar(c.usuario, meta.id, { accountId: c.conta.id, amountCents: cents(200_000), occurredOn: HOJE })

    const { ativas } = await listarMetas(c.usuario, HOJE, DIA_INICIO)
    const avaliada = ativas.find((m) => m.id === meta.id)!
    expect(avaliada.avaliacao.ritmo).toMatchObject({ origem: 'media', valor: 30_000 })
  })
})

describe('listarMetas ordena por prioridade e depois data-alvo, nulas por último', () => {
  it('ordenação', async () => {
    const c = await cenario()
    const baixa = await criarMeta(c.usuario, dadosMeta({ name: 'Baixa', priority: 'baixa', targetDate: isoDate('2026-10-01') }))
    const media = await criarMeta(c.usuario, dadosMeta({ name: 'Média', priority: 'media', targetDate: isoDate('2026-11-01') }))
    const altaSemData = await criarMeta(c.usuario, dadosMeta({ name: 'Alta sem data', priority: 'alta', targetDate: null }))
    const altaDezembro = await criarMeta(c.usuario, dadosMeta({ name: 'Alta dezembro', priority: 'alta', targetDate: isoDate('2026-12-01') }))
    const altaNovembro = await criarMeta(c.usuario, dadosMeta({ name: 'Alta novembro', priority: 'alta', targetDate: isoDate('2026-11-01') }))

    const { ativas } = await listarMetas(c.usuario, HOJE, DIA_INICIO)
    expect(ativas.map((m) => m.id)).toEqual([
      altaNovembro.id,
      altaDezembro.id,
      altaSemData.id,
      media.id,
      baixa.id,
    ])
  })

  it('encerradas vêm mais recentes primeiro, separadas das ativas', async () => {
    const c = await cenario()
    const meta1 = await criarMeta(c.usuario, dadosMeta({ name: 'Primeira a encerrar' }))
    const meta2 = await criarMeta(c.usuario, dadosMeta({ name: 'Segunda a encerrar' }))
    const ativa = await criarMeta(c.usuario, dadosMeta({ name: 'Segue ativa' }))

    await concluirMeta(c.usuario, meta1.id, isoDate('2026-09-01'))
    await arquivarMeta(c.usuario, meta2.id, isoDate('2026-09-15'))

    const resultado = await listarMetas(c.usuario, HOJE, DIA_INICIO)
    expect(resultado.ativas.map((m) => m.id)).toEqual([ativa.id])
    expect(resultado.encerradas.map((m) => m.id)).toEqual([meta2.id, meta1.id])
  })
})

describe('AMEAÇA T3/T20', () => {
  it('meta e movimento de outro usuário são recusados, e um não vê o do outro', async () => {
    const dono = await cenario()
    const intruso = await cenario()
    const meta = await criarMeta(dono.usuario, dadosMeta())

    await expect(
      aportar(intruso.usuario, meta.id, { accountId: intruso.conta.id, amountCents: cents(100), occurredOn: HOJE }),
    ).rejects.toThrow()

    const detalheIntruso = await buscarMeta(intruso.usuario, meta.id, HOJE, DIA_INICIO)
    expect(detalheIntruso).toBeNull()

    const { ativas } = await listarMetas(intruso.usuario, HOJE, DIA_INICIO)
    expect(ativas).toHaveLength(0)
  })
})
