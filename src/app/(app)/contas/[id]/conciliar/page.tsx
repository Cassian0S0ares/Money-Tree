import { notFound } from 'next/navigation'
import { buscarConta } from '../../../../../data/accounts'
import { exigirUsuario } from '../../../../../lib/session'
import { FormularioConciliacao } from './formulario'

export default async function PaginaConciliar({
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
      <h1 className="text-xl font-semibold">Conciliar {conta.name}</h1>
      <p className="mb-6 mt-1 max-w-lg text-sm text-slate-600">
        Conferir o saldo com o extrato tira o aviso de estimado. Uma divergência nunca é corrigida
        sozinha: você vê a diferença e escolhe o que fazer.
      </p>
      <FormularioConciliacao accountId={conta.id} nomeConta={conta.name} />
    </section>
  )
}
