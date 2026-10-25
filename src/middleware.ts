import { NextResponse, type NextRequest } from 'next/server'

/**
 * CSP restritiva (§11), com nonce por requisição.
 *
 * O App Router injeta scripts inline para hidratar a página, então
 * `script-src 'self'` sozinho quebraria a aplicação, e `'unsafe-inline'`
 * anularia a proteção. Com o nonce, só roda script que o próprio servidor
 * emitiu nesta resposta: o Next lê o nonce do cabeçalho da requisição e o
 * aplica aos scripts dele. `'unsafe-inline'` em style é concessão ao
 * Tailwind; nenhum domínio externo é permitido.
 */
const SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Requisição que altera dado precisa vir do próprio site (ameaça T16). O
 * Next já confere a origem das Server Actions; repetir aqui deixa a defesa
 * explícita, testada e válida para qualquer POST futuro. A comparação é do
 * host exato: "money.exemplo.com.site-malicioso.com" não passa por começar
 * igual.
 */
function origemConfere(request: NextRequest): boolean {
  if (SEGUROS.has(request.method)) return true

  const origem = request.headers.get('origin')
  const host = request.headers.get('host')
  if (!origem || !host) return false

  try {
    return new URL(origem).host === host
  } catch {
    return false
  }
}

export function middleware(request: NextRequest) {
  if (!origemConfere(request)) {
    return new NextResponse('Origem não permitida.', { status: 403 })
  }

  const nonce = btoa(crypto.randomUUID())
  const desenvolvimento = process.env.NODE_ENV !== 'production'

  const csp = [
    "default-src 'self'",
    // O recarregamento do modo dev usa eval; produção não tem exceção.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${desenvolvimento ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; ')

  const cabecalhos = new Headers(request.headers)
  cabecalhos.set('x-nonce', nonce)
  cabecalhos.set('Content-Security-Policy', csp)

  const resposta = NextResponse.next({ request: { headers: cabecalhos } })
  resposta.headers.set('Content-Security-Policy', csp)
  return resposta
}

export const config = {
  // Arquivos estáticos não executam nada; poupá-los evita custo à toa.
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [{ type: 'header', key: 'next-router-prefetch' }],
    },
  ],
}
