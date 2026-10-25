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
