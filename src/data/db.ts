import postgres from 'postgres'

let cliente: postgres.Sql | undefined

/**
 * O cliente nasce na primeira consulta, não na importação: o build do Next
 * importa os módulos das páginas e não deve precisar do segredo do banco.
 *
 * `prepare: false` não é opcional: o Supavisor em modo transação (porta
 * 6543) não mantém a sessão entre comandos, e prepared statement depende de
 * sessão. Com `prepare: true` a aplicação funciona nos primeiros minutos e
 * depois começa a falhar de forma intermitente, que é o pior modo de falhar.
 */
export function sql(): postgres.Sql {
  if (cliente) return cliente

  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL não definida.')
  }

  cliente = postgres(url, {
    prepare: false,
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    // Sem log de consulta: uma consulta financeira logada é um vazamento (§11).
    onnotice: () => {},
  })
  return cliente
}
