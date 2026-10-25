import { exigirUsuario } from '../../../lib/session'
import { FormularioConfirmado } from '../../../components/formulario-confirmado'
import { CabecalhoPagina, Cartao, classesBotao } from '../../../components/ui'
import { encerrarOutrasSessoes } from './acoes'
import { FormularioPreferencias } from './formulario'

export const metadata = { title: 'Configurações' }

export default async function PaginaConfiguracoes() {
  const usuario = await exigirUsuario()

  return (
    <section className="max-w-2xl space-y-8">
      <CabecalhoPagina titulo="Configurações" descricao={`Conectado como ${usuario.email}.`} />

      <Cartao as="section" className="p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Preferências</h2>
        <FormularioPreferencias usuario={usuario} />
      </Cartao>

      <Cartao as="section" className="p-6">
        <h2 className="text-base font-semibold text-slate-900">Sessões</h2>
        <p className="mt-1 text-sm text-slate-600">
          Perdeu um aparelho ou entrou num computador que não é seu? Encerre todas as sessões. Você
          precisará entrar de novo aqui também.
        </p>
        <FormularioConfirmado
          action={encerrarOutrasSessoes}
          titulo="Encerrar todas as sessões?"
          descricao="Todos os dispositivos conectados, inclusive este, serão desconectados."
          rotuloConfirmar="Encerrar todas"
          perigoso
          className="mt-4"
        >
          <button type="submit" className={classesBotao('secundario', 'border-red-300 text-red-800!')}>
            Encerrar todas as sessões
          </button>
        </FormularioConfirmado>
      </Cartao>
    </section>
  )
}
