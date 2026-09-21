import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const PROIBIDOS = ['postgres', 'pg', 'react', 'next', 'node:fs', 'node:net']
const DOMINIO = join(process.cwd(), 'src/domain')

describe('fronteira do domínio', () => {
  it('nenhum arquivo de domínio importa I/O', () => {
    const arquivos = readdirSync(DOMINIO).filter((f) => f.endsWith('.ts'))
    expect(arquivos.length).toBeGreaterThan(0)

    const violacoes: string[] = []
    for (const arquivo of arquivos) {
      const conteudo = readFileSync(join(DOMINIO, arquivo), 'utf8')
      for (const proibido of PROIBIDOS) {
        if (new RegExp(`from\\s+['"]${proibido}(/|['"])`).test(conteudo)) {
          violacoes.push(`${arquivo} importa ${proibido}`)
        }
      }
    }
    expect(violacoes).toEqual([])
  })
})
