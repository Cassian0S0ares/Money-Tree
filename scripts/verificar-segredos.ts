/**
 * Procura segredos em arquivos do repositório (ameaça T8).
 *
 *   npx tsx scripts/verificar-segredos.ts            todos os arquivos versionados (CI)
 *   npx tsx scripts/verificar-segredos.ts --staged   só o que vai no próximo commit (pre-commit)
 */
import { execFileSync } from 'node:child_process'
import { procurarSegredos, type Achado } from './segredos'

/** Os testes deste verificador carregam exemplos de segredo de propósito. */
const IGNORADOS = new Set(['tests/unit/verificar-segredos.test.ts'])

function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

function principal() {
  const soPreparados = process.argv.includes('--staged')
  const arquivos = (
    soPreparados
      ? git(['diff', '--cached', '--name-only', '--diff-filter=ACMR'])
      : git(['ls-files'])
  )
    .split('\n')
    .filter((arquivo) => arquivo && !IGNORADOS.has(arquivo))

  const achados: Achado[] = []
  for (const arquivo of arquivos) {
    // No modo pre-commit lê a versão preparada, não a do disco: é ela que
    // vai para o histórico.
    let conteudo: string
    try {
      conteudo = soPreparados ? git(['show', `:${arquivo}`]) : git(['show', `HEAD:${arquivo}`])
    } catch {
      conteudo = ''
    }
    if (conteudo.includes('\u0000')) continue // binário
    achados.push(...procurarSegredos(arquivo, conteudo))
  }

  if (achados.length > 0) {
    console.error('Possíveis segredos encontrados. Nada foi alterado; troque por placeholder:\n')
    for (const achado of achados) {
      // Só o local e o motivo: repetir o valor no terminal seria vazar de novo.
      console.error(`  ${achado.arquivo}${achado.linha ? `:${achado.linha}` : ''}  ${achado.motivo}`)
    }
    process.exit(1)
  }

  console.log(`Nenhum segredo encontrado em ${arquivos.length} arquivos.`)
}

principal()
