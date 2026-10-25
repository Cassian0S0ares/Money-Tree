'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/', rotulo: 'Saldos' },
  { href: '/lancamentos', rotulo: 'Lançamentos' },
  { href: '/recorrencias', rotulo: 'Recorrências' },
  { href: '/contas', rotulo: 'Contas' },
  { href: '/categorias', rotulo: 'Categorias' },
  { href: '/configuracoes', rotulo: 'Configurações' },
]

function ativo(caminho: string, href: string): boolean {
  return href === '/' ? caminho === '/' : caminho === href || caminho.startsWith(`${href}/`)
}

/**
 * A página atual leva `aria-current` e, além da cor, um sublinhado grosso:
 * a indicação não depende só de cor (§14). No celular a lista rola na
 * horizontal em vez de se esconder atrás de um menu.
 */
export function Navegacao() {
  const caminho = usePathname()

  return (
    <nav aria-label="Principal" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-1 whitespace-nowrap text-sm">
        {LINKS.map((link) => {
          const atual = ativo(caminho, link.href)
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={atual ? 'page' : undefined}
                className={`inline-flex min-h-10 items-center rounded-lg px-3 font-medium transition-colors ${
                  atual
                    ? 'bg-marca-50 text-marca-800 underline decoration-2 underline-offset-8'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {link.rotulo}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
