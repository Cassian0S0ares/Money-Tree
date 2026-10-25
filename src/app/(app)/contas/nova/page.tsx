import { hojeEm } from '../../../../domain/dates'
import { exigirUsuario } from '../../../../lib/session'
import { CabecalhoPagina } from '../../../../components/ui'
import { FormularioConta } from '../formulario'

export const metadata = { title: 'Nova conta' }

export default async function PaginaNovaConta() {
  const usuario = await exigirUsuario()

  return (
    <section>
      <CabecalhoPagina
        titulo="Nova conta"
        descricao="Conta corrente, poupança, carteira, cartão ou investimento. Você pode editar depois."
      />
      <FormularioConta hoje={hojeEm(usuario.timezone)} />
    </section>
  )
}
