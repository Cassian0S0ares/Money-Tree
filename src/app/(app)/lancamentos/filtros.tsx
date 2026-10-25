import Link from 'next/link'
import type { Conta } from '../../../data/accounts'
import type { Categoria } from '../../../data/categories'

const ESTADOS = [
  { valor: '', rotulo: 'Todos os estados' },
  { valor: 'previsto', rotulo: 'Previsto' },
  { valor: 'pendente', rotulo: 'Pendente' },
  { valor: 'liquidado', rotulo: 'Liquidado' },
  { valor: 'conciliado', rotulo: 'Conciliado' },
  { valor: 'cancelado', rotulo: 'Cancelado' },
  { valor: 'estornado', rotulo: 'Estornado' },
]

/**
 * Formulário GET: o filtro vira parâmetro na URL. Recarregar não perde o
 * filtro, o link pode ser guardado e o botão Voltar funciona.
 */
export function Filtros({
  contas,
  categorias,
  atual,
}: {
  contas: Conta[]
  categorias: Categoria[]
  atual: Record<string, string>
}) {
  return (
    <form
      method="get"
      className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4"
    >
      <div>
        <label htmlFor="conta" className="block text-sm font-medium">Conta</label>
        <select id="conta" name="conta" defaultValue={atual.conta ?? ''} className="mt-1 rounded border border-slate-300 px-3 py-2">
          <option value="">Todas</option>
          {contas.map((conta) => (
            <option key={conta.id} value={conta.id}>{conta.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="categoria" className="block text-sm font-medium">Categoria</label>
        <select id="categoria" name="categoria" defaultValue={atual.categoria ?? ''} className="mt-1 rounded border border-slate-300 px-3 py-2">
          <option value="">Todas</option>
          {categorias.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>{categoria.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="estado" className="block text-sm font-medium">Estado</label>
        <select id="estado" name="estado" defaultValue={atual.estado ?? ''} className="mt-1 rounded border border-slate-300 px-3 py-2">
          {ESTADOS.map((estado) => (
            <option key={estado.valor} value={estado.valor}>{estado.rotulo}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="de" className="block text-sm font-medium">De</label>
        <input id="de" name="de" type="date" defaultValue={atual.de ?? ''} className="mt-1 rounded border border-slate-300 px-3 py-2" />
      </div>

      <div>
        <label htmlFor="ate" className="block text-sm font-medium">Até</label>
        <input id="ate" name="ate" type="date" defaultValue={atual.ate ?? ''} className="mt-1 rounded border border-slate-300 px-3 py-2" />
      </div>

      <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">
        Filtrar
      </button>
      <Link href="/lancamentos" className="px-2 py-2 text-sm underline">
        Limpar
      </Link>
    </form>
  )
}
