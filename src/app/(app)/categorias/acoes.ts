'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  arquivarCategoria,
  atualizarCategoria,
  criarCategoria,
  listarCategorias,
} from '../../../data/categories'
import { registrarEvento } from '../../../data/audit'
import { exigirUsuario } from '../../../lib/session'

const Formulario = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'Informe o nome da categoria'),
  kind: z.enum(['receita', 'despesa']),
  parentId: z.string().uuid().optional().or(z.literal('')),
})

export interface EstadoFormularioCategoria {
  erro?: string
  valores?: Record<string, string>
  sucesso?: boolean
  /** Incrementada no cliente a cada resposta, para remontar o formulário. */
  chave?: number
}

export async function salvarCategoria(
  _anterior: EstadoFormularioCategoria,
  formData: FormData,
): Promise<EstadoFormularioCategoria> {
  const usuario = await exigirUsuario()
  const bruto = Object.fromEntries(formData) as Record<string, string>
  const analise = Formulario.safeParse(bruto)

  if (!analise.success) {
    return { erro: analise.error.issues[0].message, valores: bruto }
  }

  const parentId = analise.data.parentId || null

  // Subcategoria herda o tipo do pai: "Salário" dentro de "Moradia" faria a
  // receita aparecer somada às despesas da casa.
  let kind = analise.data.kind
  if (parentId) {
    const pai = (await listarCategorias(usuario.id)).find((c) => c.id === parentId)
    if (!pai) return { erro: 'A categoria escolhida como grupo não existe mais.', valores: bruto }
    kind = pai.kind
  }

  const dados = { name: analise.data.name, kind, parentId }

  try {
    const categoria = analise.data.id
      ? await atualizarCategoria(usuario.id, analise.data.id, dados)
      : await criarCategoria(usuario.id, dados)

    await registrarEvento(usuario.id, {
      eventType: analise.data.id ? 'categoria.atualizada' : 'categoria.criada',
      objectType: 'category',
      objectId: categoria.id,
      source: 'usuario',
      result: 'sucesso',
    })
  } catch (erro) {
    // O índice único do banco é quem garante a regra; aqui só traduzimos.
    const duplicada = erro instanceof Error && erro.message.includes('categories_nome_unico')
    return {
      erro: duplicada
        ? 'Já existe uma categoria com esse nome no mesmo grupo.'
        : 'Não foi possível salvar a categoria.',
      valores: bruto,
    }
  }

  revalidatePath('/categorias')
  return { sucesso: true }
}

export async function arquivarCategoriaAcao(formData: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  const id = String(formData.get('id'))

  await arquivarCategoria(usuario.id, id)
  await registrarEvento(usuario.id, {
    eventType: 'categoria.arquivada',
    objectType: 'category',
    objectId: id,
    source: 'usuario',
    result: 'sucesso',
  })

  revalidatePath('/categorias')
}
