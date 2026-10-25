import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '../../src/middleware'

function requisicao(metodo: string, cabecalhos: Record<string, string> = {}) {
  return new NextRequest('https://money.exemplo.com/lancamentos/novo', {
    method: metodo,
    headers: { host: 'money.exemplo.com', ...cabecalhos },
  })
}

describe('AMEAÇA T16: requisição forjada entre sites', () => {
  it('recusa POST vindo de outra origem', () => {
    const resposta = middleware(requisicao('POST', { origin: 'https://site-malicioso.com' }))
    expect(resposta.status).toBe(403)
  })

  it('recusa POST sem Origin', () => {
    // Navegador moderno sempre manda Origin em POST; a ausência é suspeita.
    expect(middleware(requisicao('POST')).status).toBe(403)
  })

  it('recusa origem que só se parece com a do site', () => {
    const resposta = middleware(
      requisicao('POST', { origin: 'https://money.exemplo.com.site-malicioso.com' }),
    )
    expect(resposta.status).toBe(403)
  })

  it('aceita POST da própria origem', () => {
    const resposta = middleware(requisicao('POST', { origin: 'https://money.exemplo.com' }))
    expect(resposta.status).toBe(200)
  })

  it('GET passa sem Origin e leva a CSP', () => {
    const resposta = middleware(requisicao('GET'))
    expect(resposta.status).toBe(200)
    expect(resposta.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
  })
})
