import { listarCategorias } from '../../../data/categories'
import { exigirUsuario } from '../../../lib/session'
import { arquivarCategoriaAcao } from './acoes'
import { FormularioCategoria } from './formulario'

export default async function PaginaCategorias() {
  const usuario = await exigirUsuario()
  const todas = await listarCategorias(usuario.id)

  const raizes = todas.filter((categoria) => categoria.parentId === null)
  const filhasDe = (paiId: string) => todas.filter((categoria) => categoria.parentId === paiId)

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold">Categorias</h1>

      <FormularioCategoria raizes={raizes} />

      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {raizes.map((raiz) => (
          <li key={raiz.id} className="p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {raiz.name}
                <span className="ml-2 text-xs font-normal text-slate-500">
                  {raiz.kind === 'receita' ? 'Receita' : 'Despesa'}
                </span>
              </span>
              <form action={arquivarCategoriaAcao}>
                <input type="hidden" name="id" value={raiz.id} />
                <button type="submit" className="text-sm underline">Arquivar</button>
              </form>
            </div>

            {filhasDe(raiz.id).length > 0 && (
              <ul className="mt-2 space-y-1 pl-4">
                {filhasDe(raiz.id).map((filha) => (
                  <li key={filha.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{filha.name}</span>
                    <form action={arquivarCategoriaAcao}>
                      <input type="hidden" name="id" value={filha.id} />
                      <button type="submit" className="underline">Arquivar</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
