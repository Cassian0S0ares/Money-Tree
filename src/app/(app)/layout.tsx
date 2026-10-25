import Link from 'next/link'
import { exigirUsuario } from '../../lib/session'

const LINKS = [
  { href: '/', rotulo: 'Saldos' },
  { href: '/lancamentos', rotulo: 'Lançamentos' },
  { href: '/contas', rotulo: 'Contas' },
  { href: '/categorias', rotulo: 'Categorias' },
  { href: '/configuracoes', rotulo: 'Configurações' },
]

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const usuario = await exigirUsuario()

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <p className="text-lg font-semibold">Money Tree</p>
        <nav aria-label="Principal">
          <ul className="flex flex-wrap gap-4 text-sm">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rounded px-1 py-0.5 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {link.rotulo}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="text-sm text-slate-600">{usuario.displayName}</p>
      </header>
      <main id="conteudo">{children}</main>
    </div>
  )
}
