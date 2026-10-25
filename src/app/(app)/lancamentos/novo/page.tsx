import Link from 'next/link'
import { listarContas } from '../../../../data/accounts'
import { listarCategorias } from '../../../../data/categories'
import { exigirUsuario } from '../../../../lib/session'
import { SemDados } from '../../../../components/states'
import { FormularioLancamento } from '../formulario'

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
        acao={
          <Link href="/contas/nova" className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">
            Cadastrar conta
          </Link>
        }
      />
    )
  }

  return (
    <section>
      <h1 className="mb-6 text-xl font-semibold">Novo lançamento</h1>
      <FormularioLancamento contas={contas} categorias={categorias} />
    </section>
  )
}
