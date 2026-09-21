import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import EmbeddedPostgres from 'embedded-postgres'

/**
 * Postgres 17 embutido para testes de integração. Sem Docker: roda como
 * processo filho, dados descartáveis em `.pgdata-test/` (nunca versionado).
 * Porta 55432 para não colidir com um Postgres já instalado na máquina.
 */
const DATABASE_DIR = join(process.cwd(), '.pgdata-test')
const PORT = 55432
const DATABASE_NAME = 'money_tree_test'

function criarInstancia(): EmbeddedPostgres {
  return new EmbeddedPostgres({
    databaseDir: DATABASE_DIR,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: false,
  })
}

/**
 * Sobe um cluster Postgres 17 embutido e cria o banco `money_tree_test`.
 * `initialise()` falha se o diretório de dados já existir (por exemplo,
 * restos de uma execução anterior interrompida) — por isso o diretório é
 * removido antes de inicializar.
 */
export async function iniciarPostgresDeTeste(): Promise<EmbeddedPostgres> {
  if (existsSync(DATABASE_DIR)) {
    rmSync(DATABASE_DIR, { recursive: true, force: true })
  }

  const pg = criarInstancia()
  await pg.initialise()
  await pg.start()
  await pg.createDatabase(DATABASE_NAME)

  return pg
}

/** Encerra o cluster iniciado por `iniciarPostgresDeTeste`. */
export async function pararPostgresDeTeste(pg: EmbeddedPostgres): Promise<void> {
  await pg.stop()
}
