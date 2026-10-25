import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import EmbeddedPostgres from 'embedded-postgres'

/**
 * Postgres 17 descartável para `restore-test.sh`, sem Docker. Fica no ar
 * até Ctrl+C e apaga os dados ao sair. Porta 55434, longe da de testes.
 */
const DIR = join(process.cwd(), '.pgdata-restore')

async function main() {
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true })

  const pg = new EmbeddedPostgres({
    databaseDir: DIR,
    user: 'postgres',
    password: 'postgres',
    port: 55434,
    persistent: false,
    onLog: () => {},
  })
  await pg.initialise()
  await pg.start()

  console.log('Postgres descartável em postgresql://postgres:postgres@localhost:55434')
  console.log('Ctrl+C para encerrar e apagar.')

  const parar = async () => {
    await pg.stop()
    process.exit(0)
  }
  process.on('SIGINT', parar)
  process.on('SIGTERM', parar)
}

main()
