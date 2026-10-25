import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// `globSync` de node:fs só existe a partir do Node 22; a máquina roda 20.
const ARQUIVOS = readdirSync('src', { recursive: true, encoding: 'utf8' })
  .filter((arquivo) => /\.tsx?$/.test(arquivo))
  .map((arquivo) => join('src', arquivo))

/** Comentário pode citar `confirm()` para explicar por que não usa. */
function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('proibições de interface', () => {
  it('não usa alert, confirm ou prompt do navegador (§13)', () => {
    const violacoes: string[] = []
    for (const arquivo of ARQUIVOS) {
      const conteudo = semComentarios(readFileSync(arquivo, 'utf8'))
      if (/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(conteudo)) {
        violacoes.push(arquivo)
      }
    }
    expect(violacoes).toEqual([])
  })

  it('não usa dangerouslySetInnerHTML (§5.3: texto do usuário é não confiável)', () => {
    const violacoes = ARQUIVOS.filter((a) =>
      readFileSync(a, 'utf8').includes('dangerouslySetInnerHTML'),
    )
    expect(violacoes).toEqual([])
  })
})
