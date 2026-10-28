import { listarContas } from '../../../../data/accounts'
import { exigirUsuario } from '../../../../lib/session'
import { CabecalhoPagina } from '../../../../components/ui'
import { FormularioMeta } from '../formulario'

export const metadata = { title: 'Nova meta' }

export default async function PaginaNovaMeta() {
  const usuario = await exigirUsuario()
  const contas = await listarContas(usuario.id)

  return (
    <section>
      <CabecalhoPagina
        titulo="Nova meta"
        descricao="Depois de criar, reserve dinheiro de uma conta para ela na página da meta."
      />
      <FormularioMeta
        contas={contas.map((c) => ({ id: c.id, name: c.name }))}
        padrao={{
          name: '', kind: 'livre', alvo: '', data: '', priority: 'media',
          accountId: contas.length === 1 ? contas[0].id : '', contribuicao: '',
        }}
      />
    </section>
  )
}
