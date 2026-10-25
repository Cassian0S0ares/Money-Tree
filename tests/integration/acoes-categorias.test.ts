import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, limparBanco, sqlAdmin } from './helpers'
import {
  arquivarCategoria,
  criarCategoria,
  listarCategorias,
  semearCategoriasPadrao,
} from '../../src/data/categories'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

describe('categorias', () => {
  it('monta a árvore de pai e filhas', async () => {
    const usuario = await criarUsuario()
    const pai = await criarCategoria(usuario, { name: 'Transporte', kind: 'despesa', sortOrder: 1 })
    await criarCategoria(usuario, {
      name: 'Combustível',
      kind: 'despesa',
      parentId: pai.id,
      sortOrder: 2,
    })

    const todas = await listarCategorias(usuario)
    const raizes = todas.filter((c) => c.parentId === null)
    const filhas = todas.filter((c) => c.parentId === pai.id)

    expect(raizes).toHaveLength(1)
    expect(filhas.map((f) => f.name)).toEqual(['Combustível'])
  })

  it('rejeita nome repetido dentro do mesmo pai, ignorando maiúsculas', async () => {
    const usuario = await criarUsuario()
    await criarCategoria(usuario, { name: 'Mercado', kind: 'despesa' })

    await expect(criarCategoria(usuario, { name: 'MERCADO', kind: 'despesa' })).rejects.toThrow()
  })

  it('permite o mesmo nome sob pais diferentes', async () => {
    const usuario = await criarUsuario()
    const casa = await criarCategoria(usuario, { name: 'Casa', kind: 'despesa' })
    const carro = await criarCategoria(usuario, { name: 'Carro', kind: 'despesa' })

    await criarCategoria(usuario, { name: 'Seguro', kind: 'despesa', parentId: casa.id })
    await expect(
      criarCategoria(usuario, { name: 'Seguro', kind: 'despesa', parentId: carro.id }),
    ).resolves.toBeDefined()
  })

  it('arquivar some da lista sem apagar o registro', async () => {
    const usuario = await criarUsuario()
    await semearCategoriasPadrao(usuario)
    const [primeira] = await listarCategorias(usuario)

    await arquivarCategoria(usuario, primeira.id)

    expect(await listarCategorias(usuario)).toHaveLength(13)
    expect(await listarCategorias(usuario, { incluirArquivadas: true })).toHaveLength(14)
  })

  it('categoria de sistema pode ser renomeada: is_system marca origem, não trava', async () => {
    const usuario = await criarUsuario()
    await semearCategoriasPadrao(usuario)
    const [moradia] = await listarCategorias(usuario)

    expect(moradia.isSystem).toBe(true)

    const { atualizarCategoria } = await import('../../src/data/categories')
    const renomeada = await atualizarCategoria(usuario, moradia.id, { name: 'Casa e aluguel' })
    expect(renomeada.name).toBe('Casa e aluguel')
  })
})
