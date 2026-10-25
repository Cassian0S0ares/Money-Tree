import type postgres from 'postgres'
import { sql } from './db'

/**
 * Abre uma transação, assume o role da aplicação e declara de quem é a
 * sessão. As policies de RLS leem `app.user_id` e filtram tudo.
 *
 * `set_config(..., true)` limita o efeito à transação: a conexão volta ao
 * pool sem carregar a identidade do usuário anterior. Com `false` ali, um
 * pedido herdaria o usuário do pedido passado — exatamente a falha que a
 * ameaça T3 descreve.
 */
export async function comoUsuario<T>(
  userId: string,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId}, true)`
    return fn(tx)
  }) as Promise<T>
}

/**
 * Transação sem identidade, para o que acontece antes do login: procurar o
 * usuário pelo e-mail e validar a senha. A RLS bloqueia tudo aqui, então as
 * consultas usadas neste caminho rodam com privilégio elevado e ficam
 * restritas a `src/data/users.ts` e `src/data/sessions.ts`.
 */
export async function semUsuario<T>(
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return sql.begin((tx) => fn(tx)) as Promise<T>
}
