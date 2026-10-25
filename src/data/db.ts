import postgres from 'postgres'

const url = process.env.DATABASE_URL

if (!url) {
  throw new Error('DATABASE_URL não definida.')
}

/**
 * `prepare: false` não é opcional: o Supavisor em modo transação (porta
 * 6543) não mantém a sessão entre comandos, e prepared statement depende de
 * sessão. Com `prepare: true` a aplicação funciona nos primeiros minutos e
 * depois começa a falhar de forma intermitente, que é o pior modo de falhar.
 */
export const sql = postgres(url, {
  prepare: false,
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  // Sem log de consulta: uma consulta financeira logada é um vazamento (§11).
  onnotice: () => {},
})
