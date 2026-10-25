import Link from 'next/link'
import { notFound } from 'next/navigation'
import { buscarConta } from '../../../../../data/accounts'
import { exigirUsuario } from '../../../../../lib/session'
import { CabecalhoPagina } from '../../../../../components/ui'
import { FormularioConciliacao } from './formulario'

export const metadata = { title: 'Conciliar conta' }

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
      <Link href="/contas" className="mb-4 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-marca-700 hover:underline">
        <span aria-hidden="true">←</span> Contas
      </Link>
      <CabecalhoPagina
        titulo={`Conciliar ${conta.name}`}
        descricao="Conferir o saldo com o extrato tira o aviso de estimado. Uma divergência nunca é corrigida sozinha: você vê a diferença e escolhe o que fazer."
      />
      <FormularioConciliacao accountId={conta.id} nomeConta={conta.name} />
    </section>
  )
}
