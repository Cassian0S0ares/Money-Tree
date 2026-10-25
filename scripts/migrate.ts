import { execFileSync } from 'node:child_process'

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL

if (!url) {
  console.error('Defina MIGRATION_DATABASE_URL (porta 5432, modo sessão).')
  process.exit(1)
}

/**
 * O pooler em modo transação (6543) não mantém sessão entre comandos, e
 * migração precisa de sessão: advisory lock, DDL transacional e SET.
 * Falhar aqui é muito melhor do que falhar no meio de um ALTER TABLE.
 */
if (new URL(url).port === '6543') {
  console.error(
    'Migração na porta 6543 quebra. Use a 5432 (modo sessão) em MIGRATION_DATABASE_URL.',
  )
  process.exit(1)
}

const direcao = process.argv[2] ?? 'up'

execFileSync(
  'npx',
  [
    'node-pg-migrate',
    direcao,
    '--migrations-dir',
    'migrations',
    '--migration-file-language',
    'sql',
    '--envPath',
    '.env.local',
  ],
  { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url }, shell: true },
)
