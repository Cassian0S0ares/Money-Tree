/**
 * Regras do verificador de segredos (ameaça T8). A linha de comando está em
 * `verificar-segredos.ts`; aqui fica só o que dá para testar sem Git.
 *
 * Não substitui disciplina: pega os formatos que este projeto usa (URL do
 * Postgres, chaves do Supabase, chave privada, .env). Falso positivo se
 * resolve trocando o valor por placeholder, nunca afrouxando a regra.
 */
export interface Achado {
  arquivo: string
  linha: number
  motivo: string
}

/** Senhas que são placeholder ou do banco descartável de teste. */
const SENHAS_PERMITIDAS = new Set(['SENHA', 'postgres', 'money_tree_app', 'senha', 'password', '...'])
const HOSTS_LOCAIS = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/

const REGRAS: { motivo: string; teste: (linha: string) => boolean }[] = [
  {
    motivo: 'URL do Postgres com senha',
    teste: (linha) => {
      for (const casou of linha.matchAll(/postgres(?:ql)?:\/\/[^:\s/@]+:([^@\s]+)@([^/\s?'"`]+)/g)) {
        const [, senha, host] = casou
        if (SENHAS_PERMITIDAS.has(senha) || senha.startsWith('$') || senha.startsWith('<')) continue
        if (HOSTS_LOCAIS.test(host)) continue
        return true
      }
      return false
    },
  },
  {
    motivo: 'chave privada',
    teste: (linha) => /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(linha),
  },
  {
    motivo: 'token JWT (formato das chaves do Supabase)',
    teste: (linha) => /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(linha),
  },
  {
    motivo: 'chave secreta do Supabase',
    teste: (linha) => /\bsb_secret_[A-Za-z0-9_-]{10,}/.test(linha),
  },
]

/** Arquivo de ambiente real, nunca versionado. O exemplo é permitido. */
function arquivoProibido(arquivo: string): string | null {
  const nome = arquivo.split('/').pop() ?? arquivo
  if (/^\.env(\..+)?$/.test(nome) && nome !== '.env.example') return 'arquivo .env versionado'
  return null
}

export function procurarSegredos(arquivo: string, conteudo: string): Achado[] {
  const achados: Achado[] = []

  const proibido = arquivoProibido(arquivo)
  if (proibido) achados.push({ arquivo, linha: 0, motivo: proibido })

  conteudo.split('\n').forEach((texto, indice) => {
    for (const regra of REGRAS) {
      if (regra.teste(texto)) achados.push({ arquivo, linha: indice + 1, motivo: regra.motivo })
    }
  })
  return achados
}
