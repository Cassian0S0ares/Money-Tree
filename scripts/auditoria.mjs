#!/usr/bin/env node
/**
 * Auditoria de dependências (ameaça T13). Falha em vulnerabilidade alta ou
 * crítica, exceto as listadas abaixo — cada exceção diz por que o risco não
 * se aplica aqui e o que precisa acontecer para ela sair da lista. Exceção
 * sem motivo não entra; exceção cujo aviso sumiu do `npm audit` também faz o
 * script falhar, para a lista não apodrecer.
 *
 * Uso: node scripts/auditoria.mjs
 */
import { execSync } from 'node:child_process'

const EXCECOES = {
  // PostCSS embutido no Next 15. Só processa o CSS do próprio projeto no
  // build; nenhum CSS ou source map vem de usuário. Sai ao migrar para o
  // Next 16, que traz a versão corrigida.
  'GHSA-qx2v-qp2m-jg93': 'postcss no Next 15; só CSS do projeto, no build',
  'GHSA-6g55-p6wh-862q': 'postcss no Next 15; sem source map de terceiros',
  'GHSA-fxqj-rqcc-2cmp': 'postcss no Next 15; sem source map de terceiros',
  'GHSA-r28c-9q8g-f849': 'postcss no Next 15; sem source map de terceiros',
  // Vitest 3 e seu pool. Só rodam em desenvolvimento e no CI, sobre código
  // do próprio repositório; nada disso vai para produção. Sai ao migrar para
  // o Vitest 4 (muda a configuração de pool dos testes de integração).
  'GHSA-5gmw-xhrv-c9v3': 'tinypool do Vitest 3; só desenvolvimento',
  'GHSA-85c8-ppgw-ccpr': 'tinypool do Vitest 3; só desenvolvimento',
  'GHSA-82fw-gwwq-j7x9': 'mocker do Vitest 3; só desenvolvimento',
}

const GRAVES = new Set(['high', 'critical'])

let bruto
try {
  // execSync passa pelo shell: no Windows o npm é npm.cmd, que execFileSync
  // não encontra.
  bruto = execSync('npm audit --json', { encoding: 'utf8' })
} catch (erro) {
  // npm audit sai com código diferente de zero quando acha algo; o JSON vem
  // do mesmo jeito. Sem stdout, o npm nem rodou: o erro original explica.
  if (!erro.stdout) throw erro
  bruto = erro.stdout
}

const relatorio = JSON.parse(bruto)
const vistos = new Set()
const problemas = []

for (const [pacote, vulneravel] of Object.entries(relatorio.vulnerabilities ?? {})) {
  for (const origem of vulneravel.via) {
    if (typeof origem === 'string') continue // herdada de outro pacote, listado à parte
    const id = origem.url?.split('/').pop()
    vistos.add(id)
    if (!GRAVES.has(origem.severity) && !GRAVES.has(vulneravel.severity)) continue
    if (id && EXCECOES[id]) continue
    problemas.push(`${vulneravel.severity.padEnd(8)} ${pacote}: ${origem.title} (${origem.url})`)
  }
}

const obsoletas = Object.keys(EXCECOES).filter((id) => !vistos.has(id))

for (const id of Object.keys(EXCECOES).filter((id) => vistos.has(id))) {
  console.log(`exceção aceita  ${id}: ${EXCECOES[id]}`)
}

if (obsoletas.length > 0) {
  console.error(`\nExceções que não aparecem mais no npm audit; remova-as: ${obsoletas.join(', ')}`)
}
if (problemas.length > 0) {
  console.error(`\nVulnerabilidades altas ou críticas sem exceção registrada:\n${problemas.join('\n')}`)
}
if (obsoletas.length > 0 || problemas.length > 0) process.exit(1)

console.log('\nAuditoria ok: nenhuma vulnerabilidade alta ou crítica fora das exceções.')
