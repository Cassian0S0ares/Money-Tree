import type { Metadata } from 'next'
import './globals.css'

/**
 * A CSP leva um nonce novo a cada requisição (`src/middleware.ts`), e só HTML
 * gerado na requisição pode carregá-lo. Página pré-renderizada no build teria
 * scripts sem nonce, bloqueados pela própria CSP em produção.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Money Tree',
  description: 'Gestão financeira pessoal',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded focus:bg-white focus:px-4 focus:py-2"
        >
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  )
}
