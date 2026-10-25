import Link from 'next/link'
import { exigirUsuario } from '../../lib/session'
import { Marca } from '../../components/ui'
import { sair } from '../entrar/acoes'
import { Navegacao } from './navegacao'

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const usuario = await exigirUsuario()

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" aria-label="Money Tree, ir para os saldos" className="rounded-lg">
            <Marca />
          </Link>

          <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
            <Navegacao />
          </div>

          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden max-w-40 truncate text-slate-600 sm:inline" title={usuario.displayName}>
              {usuario.displayName}
            </span>
            <form action={sair}>
              <button
                type="submit"
                className="min-h-10 rounded-lg px-3 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      <main id="conteudo" className="mx-auto max-w-5xl px-4 py-8">
        {children}
      </main>
    </div>
  )
}
