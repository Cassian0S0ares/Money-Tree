import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, limparBanco, sqlAdmin } from './helpers'
import {
  arquivarConta,
  atualizarConta,
  criarConta,
  listarContas,
  listarContasComSaldo,
} from '../../src/data/accounts'
import { listarCategorias, semearCategoriasPadrao } from '../../src/data/categories'
import { cents } from '../../src/domain/money'
import { isoDate } from '../../src/domain/dates'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

const dadosConta = {
  name: 'Corrente',
  type: 'corrente' as const,
  institution: 'Banco X',
  initialBalanceCents: cents(100_000),
  initialBalanceDate: isoDate('2026-09-01'),
}

describe('repositório de contas', () => {
  it('cria e lê de volta com os tipos certos', async () => {
    const usuario = await criarUsuario()
    const criada = await criarConta(usuario, dadosConta)

    expect(criada.name).toBe('Corrente')
    expect(criada.initialBalanceCents).toBe(100_000)
    expect(typeof criada.initialBalanceCents).toBe('number')
    expect(criada.initialBalanceDate).toBe('2026-09-01')
    expect(criada.includeInAvailable).toBe(true)
  })

  it('cartão nasce fora do saldo disponível', async () => {
    const usuario = await criarUsuario()
    const cartao = await criarConta(usuario, { ...dadosConta, name: 'Cartão', type: 'cartao_credito' })
    expect(cartao.includeInAvailable).toBe(false)
    expect(cartao.isLiquid).toBe(false)
  })

  it('arquivar preserva o registro', async () => {
    const usuario = await criarUsuario()
    const conta = await criarConta(usuario, dadosConta)

    await arquivarConta(usuario, conta.id)

    expect(await listarContas(usuario)).toHaveLength(0)
    expect(await listarContas(usuario, { incluirArquivadas: true })).toHaveLength(1)
  })

  it('atualizar não apaga campo que não foi enviado', async () => {
    const usuario = await criarUsuario()
    const conta = await criarConta(usuario, dadosConta)

    const atualizada = await atualizarConta(usuario, conta.id, { name: 'Conta Principal' })

    expect(atualizada.name).toBe('Conta Principal')
    expect(atualizada.institution).toBe('Banco X')
    expect(atualizada.initialBalanceCents).toBe(100_000)
  })

  it('listarContasComSaldo traz saldo e marca de estimado', async () => {
    const usuario = await criarUsuario()
    await criarConta(usuario, dadosConta)

    const [conta] = await listarContasComSaldo(usuario)
    expect(conta.balanceCents).toBe(100_000)
    expect(conta.isEstimated).toBe(true)
  })

  it('não enxerga conta de outro usuário', async () => {
    const usuarioA = await criarUsuario()
    const usuarioB = await criarUsuario()
    await criarConta(usuarioA, dadosConta)

    expect(await listarContas(usuarioB)).toHaveLength(0)
  })
})

describe('repositório de categorias', () => {
  it('semeia catorze categorias em ordem', async () => {
    const usuario = await criarUsuario()
    await semearCategoriasPadrao(usuario)

    const categorias = await listarCategorias(usuario)
    expect(categorias).toHaveLength(14)
    expect(categorias[0].name).toBe('Moradia')
  })

  it('filtra por tipo', async () => {
    const usuario = await criarUsuario()
    await semearCategoriasPadrao(usuario)

    const receitas = await listarCategorias(usuario, { kind: 'receita' })
    expect(receitas.map((c) => c.name)).toEqual(['Renda'])
  })
})
