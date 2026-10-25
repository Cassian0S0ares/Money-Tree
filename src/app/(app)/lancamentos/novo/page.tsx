import { listarContas } from '../../../../data/accounts'
import { listarCategorias } from '../../../../data/categories'
import { hojeEm } from '../../../../domain/dates'
import { exigirUsuario } from '../../../../lib/session'
import { SemDados } from '../../../../components/states'
import { CabecalhoPagina, LinkBotao } from '../../../../components/ui'
import { FormularioLancamento } from '../formulario'

export const metadata = { title: 'Novo lançamento' }

export default async function PaginaNovoLancamento() {
  const usuario = await exigirUsuario()
  const [contas, categorias] = await Promise.all([
    listarContas(usuario.id),
    listarCategorias(usuario.id),
  ])

  if (contas.length === 0) {
    return (
      <SemDados
        titulo="Cadastre uma conta primeiro"
        descricao="Todo lançamento pertence a uma conta. Crie a sua para começar a registrar."
        acao={<LinkBotao href="/contas/nova">Cadastrar conta</LinkBotao>}
      />
    )
  }

  return (
    <section>
      <CabecalhoPagina titulo="Novo lançamento" />
      <FormularioLancamento contas={contas} categorias={categorias} hoje={hojeEm(usuario.timezone)} />
    </section>
  )
}
