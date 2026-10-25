import { describe, expect, it } from 'vitest'
import { procurarSegredos } from '../../scripts/segredos'

// Os exemplos são montados por partes para este arquivo não parecer, ele
// mesmo, um vazamento (e ele está na lista de ignorados do verificador).
const jwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJyb2xlIjoic2VydmljZV9yb2xlIn0', 'abcdefghijklmnop'].join('.')

function motivos(arquivo: string, conteudo: string) {
  return procurarSegredos(arquivo, conteudo).map((achado) => achado.motivo)
}

describe('AMEAÇA T8: verificador de segredos', () => {
  it('acusa URL do Supabase com senha real', () => {
    expect(
      motivos('src/x.ts', 'const url = "postgresql://money_tree_app:Xk9!real@aws-0.pooler.supabase.com:6543/postgres"'),
    ).toEqual(['URL do Postgres com senha'])
  })

  it('aceita o placeholder do .env.example e o banco local de teste', () => {
    expect(motivos('.env.example', 'DATABASE_URL=postgresql://money_tree_app:SENHA@HOST.pooler.supabase.com:6543/postgres')).toEqual([])
    expect(motivos('x.ts', 'postgresql://postgres:postgres@localhost:55432/money_tree_test')).toEqual([])
    expect(motivos('x.ts', 'postgresql://app:qualquer@127.0.0.1:5432/db')).toEqual([])
  })

  it('acusa chave do Supabase, chave secreta e chave privada', () => {
    expect(motivos('a.ts', `SUPABASE_KEY=${jwt}`)).toEqual(['token JWT (formato das chaves do Supabase)'])
    expect(motivos('a.ts', 'KEY=sb_secret_' + 'a1b2c3d4e5f6g7h8')).toEqual(['chave secreta do Supabase'])
    expect(motivos('id', '-----BEGIN OPENSSH ' + 'PRIVATE KEY-----')).toEqual(['chave privada'])
  })

  it('acusa .env versionado, mas não o .env.example', () => {
    expect(motivos('.env.local', 'X=1')).toEqual(['arquivo .env versionado'])
    expect(motivos('config/.env', '')).toEqual(['arquivo .env versionado'])
    expect(motivos('.env.example', 'X=1')).toEqual([])
  })

  it('aponta a linha', () => {
    const [achado] = procurarSegredos('a.ts', `linha 1\nKEY=${jwt}`)
    expect(achado.linha).toBe(2)
  })
})
