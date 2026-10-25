import { notFound } from 'next/navigation'
import { buscarConta } from '../../../../data/accounts'
import { hojeEm } from '../../../../domain/dates'
import { exigirUsuario } from '../../../../lib/session'
import { CabecalhoPagina, LinkBotao } from '../../../../components/ui'
import { FormularioConta } from '../formulario'

export const metadata = { title: 'Editar conta' }

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
      <CabecalhoPagina
        titulo={conta.name}
        descricao="Os lançamentos ficam como estão. Mudar o saldo inicial muda o saldo calculado."
        acao={
          <LinkBotao href={`/contas/${conta.id}/conciliar`} variante="secundario">
            Conciliar com o extrato
          </LinkBotao>
        }
      />
      <FormularioConta conta={conta} hoje={hojeEm(usuario.timezone)} />
    </section>
  )
}
