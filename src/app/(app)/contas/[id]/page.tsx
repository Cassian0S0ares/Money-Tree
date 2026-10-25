import { notFound } from 'next/navigation'
import { buscarConta } from '../../../../data/accounts'
import { exigirUsuario } from '../../../../lib/session'
import { FormularioConta } from '../formulario'

export default async function PaginaEditarConta({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const usuario = await exigirUsuario()
  const conta = await buscarConta(usuario.id, id)

  if (!conta) notFound()

  return (
    <section>
      <h1 className="mb-6 text-xl font-semibold">{conta.name}</h1>
      <FormularioConta conta={conta} />
    </section>
  )
}
