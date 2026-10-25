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
export function middleware(request: NextRequest) {
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
