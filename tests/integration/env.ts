// Carrega .env.local sem dependência extra: Node 20.6+ tem --env-file, mas
// o Vitest não o repassa. Ler manualmente dispensa o dotenv.
import { existsSync, readFileSync } from 'node:fs'

if (existsSync('.env.local')) {
  for (const linha of readFileSync('.env.local', 'utf8').split('\n')) {
    const casou = /^([A-Z_]+)=(.*)$/.exec(linha.trim())
    if (casou && !process.env[casou[1]]) {
      process.env[casou[1]] = casou[2]
    }
  }
}

// O código de `src/data/` lê DATABASE_URL. Aqui ela é sempre a do banco
// embutido, como money_tree_app: se viesse do .env.local apontaria para o
// Supabase, e se fosse a do superusuário a RLS não seria testada de verdade.
process.env.DATABASE_URL =
  process.env.TEST_APP_DATABASE_URL ??
  'postgresql://money_tree_app:money_tree_app@localhost:55432/money_tree_test'
