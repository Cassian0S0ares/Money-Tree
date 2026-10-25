import { listarCategorias, type Categoria } from '../../../data/categories'
import { exigirUsuario } from '../../../lib/session'
import { FormularioConfirmado } from '../../../components/formulario-confirmado'
import { CabecalhoPagina, Cartao } from '../../../components/ui'
import { arquivarCategoriaAcao } from './acoes'
import { FormularioCategoria } from './formulario'

export const metadata = { title: 'Categorias' }

function BotaoArquivar({ categoria, temFilhas }: { categoria: Categoria; temFilhas: boolean }) {
  return (
    <FormularioConfirmado
      action={arquivarCategoriaAcao}
      titulo={`Arquivar ${categoria.name}?`}
      descricao={
        temFilhas
          ? 'A categoria e as subcategorias saem das listas. Lançamentos já registrados continuam com elas.'
          : 'A categoria sai das listas. Lançamentos já registrados continuam com ela.'
      }
      rotuloConfirmar="Arquivar"
    >
      <input type="hidden" name="id" value={categoria.id} />
      <button
        type="submit"
        className="min-h-10 rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      >
        Arquivar<span className="sr-only"> {categoria.name}</span>
      </button>
    </FormularioConfirmado>
  )
}

function Grupo({ titulo, raizes, todas }: { titulo: string; raizes: Categoria[]; todas: Categoria[] }) {
  const filhasDe = (paiId: string) => todas.filter((categoria) => categoria.parentId === paiId)

  return (
    <section aria-labelledby={`grupo-${titulo}`}>
      <h2 id={`grupo-${titulo}`} className="mb-3 text-lg font-semibold text-slate-900">
        {titulo} <span className="text-sm font-normal text-slate-500">({raizes.length})</span>
      </h2>
      <Cartao>
        <ul className="divide-y divide-slate-100">
          {raizes.map((raiz) => {
            const filhas = filhasDe(raiz.id)
            return (
              <li key={raiz.id} className="px-4 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-slate-900">{raiz.name}</span>
                  <BotaoArquivar categoria={raiz} temFilhas={filhas.length > 0} />
                </div>

                {filhas.length > 0 && (
                  <ul className="mb-1 ml-3 border-l-2 border-slate-100 pl-4">
                    {filhas.map((filha) => (
                      <li key={filha.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-slate-700">{filha.name}</span>
                        <BotaoArquivar categoria={filha} temFilhas={false} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </Cartao>
    </section>
  )
}

export default async function PaginaCategorias() {
  const usuario = await exigirUsuario()
  const todas = await listarCategorias(usuario.id)
  const raizes = todas.filter((categoria) => categoria.parentId === null)

  return (
    <section className="space-y-8">
      <CabecalhoPagina
        titulo="Categorias"
        descricao="As catorze iniciais são sugestão: renomeie, agrupe ou arquive como fizer sentido para você."
      />

      <FormularioCategoria raizes={raizes} />

      <div className="grid gap-8 lg:grid-cols-2">
        <Grupo titulo="Despesas" raizes={raizes.filter((c) => c.kind === 'despesa')} todas={todas} />
        <Grupo titulo="Receitas" raizes={raizes.filter((c) => c.kind === 'receita')} todas={todas} />
      </div>
    </section>
  )
}
