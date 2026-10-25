/**
 * Chaves que nunca vão para log. A lista cobre credenciais e todo campo
 * capaz de carregar informação financeira: valor, descrição, estabelecimento
 * e observação identificam a vida do usuário tão bem quanto o saldo (§11).
 */
const PROIBIDAS = new Set([
  'password',
  'password_hash',
  'passwordhash',
  'token',
  'token_hash',
  'tokenhash',
  'secret',
  'authorization',
  'cookie',
  'databaseurl',
  'database_url',
  'amount',
  'amountcents',
  'amount_cents',
  'signedamountcents',
  'signed_amount_cents',
  'balance',
  'balancecents',
  'balance_cents',
  'description',
  'counterparty',
  'notes',
  'note',
  'institution',
  'email',
  'prompt',
])

const MARCA = '[redigido]'

export function redigir(valor: unknown, vistos = new WeakSet<object>()): unknown {
  if (valor === null || typeof valor !== 'object') return valor

  if (vistos.has(valor)) return '[circular]'
  vistos.add(valor)

  if (Array.isArray(valor)) {
    return valor.map((item) => redigir(item, vistos))
  }

  const saida: Record<string, unknown> = {}
  for (const [chave, conteudo] of Object.entries(valor)) {
    saida[chave] = PROIBIDAS.has(chave.toLowerCase())
      ? MARCA
      : redigir(conteudo, vistos)
  }
  return saida
}

type Nivel = 'info' | 'warn' | 'error'

function emitir(nivel: Nivel, evento: string, contexto?: Record<string, unknown>) {
  const linha = {
    nivel,
    evento,
    em: new Date().toISOString(),
    ...(contexto ? { contexto: redigir(contexto) } : {}),
  }
  console[nivel === 'warn' ? 'warn' : nivel === 'error' ? 'error' : 'log'](JSON.stringify(linha))
}

export const log = {
  info: (evento: string, contexto?: Record<string, unknown>) => emitir('info', evento, contexto),
  warn: (evento: string, contexto?: Record<string, unknown>) => emitir('warn', evento, contexto),
  error: (evento: string, contexto?: Record<string, unknown>) => emitir('error', evento, contexto),
}
