import { exigirUsuario } from '../../../lib/session'
import { sair } from '../../entrar/acoes'
import { encerrarOutrasSessoes } from './acoes'
import { FormularioPreferencias } from './formulario'

export default async function PaginaConfiguracoes() {
  const usuario = await exigirUsuario()

  return (
    <section className="max-w-lg space-y-8">
      <h1 className="text-xl font-semibold">Configurações</h1>

      <FormularioPreferencias usuario={usuario} />

      <div className="space-y-3 border-t border-slate-200 pt-6">
        <h2 className="text-sm font-medium">Sessões</h2>
        <form action={sair}>
          <button type="submit" className="rounded border border-slate-300 px-4 py-2 text-sm">
            Sair deste dispositivo
          </button>
        </form>
        <form action={encerrarOutrasSessoes}>
          <button type="submit" className="rounded border border-red-300 px-4 py-2 text-sm text-red-800">
            Encerrar todas as sessões
          </button>
          <p className="mt-1 text-xs text-slate-500">
            Desconecta todos os dispositivos, inclusive este.
          </p>
        </form>
      </div>
    </section>
  )
}
