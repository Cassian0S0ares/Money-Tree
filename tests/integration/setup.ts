import { execFileSync } from 'node:child_process'
import type EmbeddedPostgres from 'embedded-postgres'
import postgres from 'postgres'
import { iniciarPostgresDeTeste, pararPostgresDeTeste } from '../../scripts/test-postgres'

const URL_PADRAO = 'postgresql://postgres:postgres@localhost:55432/money_tree_test'

let pg: EmbeddedPostgres | undefined

export async function setup() {
  // Sem Docker: o Postgres 17 embutido sobe aqui e morre no teardown. Cluster
  // novo a cada execução, então as migrações sempre rodam do zero.
  pg = await iniciarPostgresDeTeste()

  const url = process.env.TEST_DATABASE_URL ?? URL_PADRAO
  process.env.TEST_DATABASE_URL = url

  // Se a sequência só funciona em banco que já existia, ela está quebrada e
  // é melhor descobrir agora.
  execFileSync(
    'npx',
    [
      'node-pg-migrate',
      'up',
      '--migrations-dir',
      'migrations',
      '--migration-file-language',
      'sql',
    ],
    { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url }, shell: true },
  )

  // Em produção a senha do role é definida no painel do provedor. Aqui ela é
  // fixa, para que `src/data/` conecte como money_tree_app e a RLS valha.
  const admin = postgres(url, { onnotice: () => {} })
  await admin`alter role money_tree_app password 'money_tree_app'`
  await admin.end()
}

export async function teardown() {
  if (pg) await pararPostgresDeTeste(pg)
}
