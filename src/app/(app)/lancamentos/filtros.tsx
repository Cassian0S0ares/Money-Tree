import Link from 'next/link'
import type { Conta } from '../../../data/accounts'
import type { Categoria } from '../../../data/categories'
import { Rotulo, classeEntrada, classesBotao } from '../../../components/ui'

const ESTADOS = [
  { valor: '', rotulo: 'Todos' },
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
 *
 * Fica num <details>: no celular os filtros não empurram a lista para fora
 * da tela, e vêm abertos quando há filtro ativo, para ninguém esquecer que
 * está vendo uma parte só.
 */
export function Filtros({
  contas,
  categorias,
  atual,
  temFiltro,
}: {
  contas: Conta[]
  categorias: Categoria[]
  atual: Record<string, string>
  temFiltro: boolean
}) {
  return (
    <details open={temFiltro} className="group rounded-xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-medium text-slate-800 [&::-webkit-details-marker]:hidden">
        <span>
          Filtros
          {temFiltro && (
            <span className="ml-2 rounded-full bg-marca-50 px-2 py-0.5 text-xs text-marca-800">ativos</span>
          )}
        </span>
        <span aria-hidden="true" className="text-slate-500 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>

      <form method="get" className="grid gap-4 border-t border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <Rotulo htmlFor="conta">Conta</Rotulo>
          <select id="conta" name="conta" defaultValue={atual.conta ?? ''} className={classeEntrada}>
            <option value="">Todas</option>
            {contas.map((conta) => (
              <option key={conta.id} value={conta.id}>{conta.name}</option>
            ))}
          </select>
        </div>

        <div>
          <Rotulo htmlFor="categoria">Categoria</Rotulo>
          <select id="categoria" name="categoria" defaultValue={atual.categoria ?? ''} className={classeEntrada}>
            <option value="">Todas</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>{categoria.name}</option>
            ))}
          </select>
        </div>

        <div>
          <Rotulo htmlFor="estado">Estado</Rotulo>
          <select id="estado" name="estado" defaultValue={atual.estado ?? ''} className={classeEntrada}>
            {ESTADOS.map((estado) => (
              <option key={estado.valor} value={estado.valor}>{estado.rotulo}</option>
            ))}
          </select>
        </div>

        <div>
          <Rotulo htmlFor="de">De</Rotulo>
          <input id="de" name="de" type="date" defaultValue={atual.de ?? ''} className={classeEntrada} />
        </div>

        <div>
          <Rotulo htmlFor="ate">Até</Rotulo>
          <input id="ate" name="ate" type="date" defaultValue={atual.ate ?? ''} className={classeEntrada} />
        </div>

        <label className="flex min-h-10 items-center gap-2 text-sm text-slate-800 sm:col-span-2 lg:col-span-5">
          <input
            type="checkbox" name="recorrentes" value="1"
            defaultChecked={atual.recorrentes === '1'}
            className="size-4 accent-marca-700"
          />
          <span aria-hidden="true" className="text-slate-400">↻</span> Só recorrentes
        </label>

        <div className="flex flex-wrap gap-3 sm:col-span-2 lg:col-span-5">
          <button type="submit" className={classesBotao('primario')}>Aplicar filtros</button>
          {temFiltro && (
            <Link href="/lancamentos" className={classesBotao('fantasma')}>Limpar</Link>
          )}
        </div>
      </form>
    </details>
  )
}
