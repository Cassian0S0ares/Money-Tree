import { listarContas } from '../../../../data/accounts'
import { listarCategorias } from '../../../../data/categories'
import { hojeEm } from '../../../../domain/dates'
import { exigirUsuario } from '../../../../lib/session'
import { SemDados } from '../../../../components/states'
import { CabecalhoPagina, LinkBotao } from '../../../../components/ui'
import { FormularioRegra } from '../formulario'

export const metadata = { title: 'Nova recorrência' }

export default async function PaginaNovaRegra() {
  const usuario = await exigirUsuario()
  const [contas, categorias] = await Promise.all([
    listarContas(usuario.id),
    listarCategorias(usuario.id),
  ])

  if (contas.length === 0) {
    return (
      <SemDados
        titulo="Cadastre uma conta primeiro"
        descricao="Toda recorrência sai de uma conta (ou entra nela)."
        acao={<LinkBotao href="/contas/nova">Cadastrar conta</LinkBotao>}
      />
    )
  }

  return (
    <section>
      <CabecalhoPagina
        titulo="Nova recorrência"
        descricao="Para registrar uma conta que acabou de pagar e que se repete, use “Repetir” no novo lançamento."
      />
      <FormularioRegra contas={contas} categorias={categorias} hoje={hojeEm(usuario.timezone)} />
    </section>
  )
}
