import postgres from 'postgres'

const url =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:55432/money_tree_test'

/** Conexão de administração: ignora RLS, usada só para preparar e limpar. */
export const sqlAdmin = postgres(url, { prepare: false, onnotice: () => {} })

/**
 * Conexão da aplicação. No banco de teste o role money_tree_app existe mas
 * não tem senha, então reusamos a mesma URL trocando o usuário via SET ROLE
 * dentro da transação. Isso reproduz o comportamento de produção: RLS ativa,
 * sem bypass.
 */
export async function comoUsuario<T>(
  userId: string,
  fn: (sql: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return sqlAdmin.begin(async (tx) => {
    await tx`set local role money_tree_app`
    await tx`select set_config('app.user_id', ${userId}, true)`
    return fn(tx)
  }) as Promise<T>
}

export async function criarUsuario(email = `teste-${crypto.randomUUID()}@exemplo.com`) {
  const [usuario] = await sqlAdmin<{ id: string }[]>`
    insert into users (email, password_hash, display_name)
    values (${email}, 'hash-de-teste', 'Usuário de Teste')
    returning id
  `
  return usuario.id
}

export async function limparBanco() {
  await sqlAdmin`truncate users restart identity cascade`
}
