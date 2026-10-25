'use client'

import { useActionState, useState } from 'react'
import { salvarCategoria, type EstadoFormularioCategoria } from './acoes'
import type { Categoria } from '../../../data/categories'
import { Aviso, Cartao, Rotulo, classeEntrada, classesBotao } from '../../../components/ui'

const INICIAL: EstadoFormularioCategoria = {}

export function FormularioCategoria({ raizes }: { raizes: Categoria[] }) {
  // O React 19 reseta o formulário depois da ação, e <select> não volta ao
  // defaultValue. Remontar a cada resposta faz todo campo reaplicar o que o
  // usuário tinha digitado (§13).
  const [estado, acao, enviando] = useActionState(
    async (anterior: EstadoFormularioCategoria, formData: FormData) => ({
      ...(await salvarCategoria(anterior, formData)),
      chave: (anterior.chave ?? 0) + 1,
    }),
    INICIAL,
  )
  const v = estado.valores ?? {}

  // Subcategoria herda o tipo do grupo (a ação garante); o campo some para
  // não oferecer uma escolha que seria ignorada.
  const [grupo, setGrupo] = useState(v.parentId ?? '')

  return (
    <Cartao className="p-5">
      <h2 className="mb-4 text-base font-semibold text-slate-900">Nova categoria</h2>
      <form
        key={estado.chave}
        action={acao}
        className="grid items-end gap-4 sm:grid-cols-[1fr_auto_auto_auto]"
      >
        {estado.erro && (
          <Aviso tipo="erro" className="sm:col-span-4">{estado.erro}</Aviso>
        )}
        {estado.sucesso && (
          <Aviso tipo="sucesso" className="sm:col-span-4">Categoria adicionada.</Aviso>
        )}

        <div>
          <Rotulo htmlFor="name">Nome</Rotulo>
          <input
            id="name" name="name" required placeholder="Ex.: Combustível"
            defaultValue={v.name ?? ''}
            aria-invalid={estado.erro ? true : undefined}
            className={classeEntrada}
          />
        </div>

        <div>
          <Rotulo htmlFor="parentId" opcional>Dentro de</Rotulo>
          <select
            id="parentId" name="parentId" value={grupo}
            onChange={(evento) => setGrupo(evento.target.value)}
            className={classeEntrada}
          >
            <option value="">Nenhum grupo</option>
            <optgroup label="Despesas">
              {raizes.filter((r) => r.kind === 'despesa').map((raiz) => (
                <option key={raiz.id} value={raiz.id}>{raiz.name}</option>
              ))}
            </optgroup>
            <optgroup label="Receitas">
              {raizes.filter((r) => r.kind === 'receita').map((raiz) => (
                <option key={raiz.id} value={raiz.id}>{raiz.name}</option>
              ))}
            </optgroup>
          </select>
        </div>

        {grupo === '' ? (
          <div>
            <Rotulo htmlFor="kind">Tipo</Rotulo>
            <select id="kind" name="kind" defaultValue={v.kind ?? 'despesa'} className={classeEntrada}>
              <option value="despesa">Despesa</option>
              <option value="receita">Receita</option>
            </select>
          </div>
        ) : (
          // O schema exige o campo; o valor é ignorado e vem do grupo.
          <input type="hidden" name="kind" value="despesa" />
        )}

        <button type="submit" disabled={enviando} className={classesBotao('primario')}>
          {enviando ? 'Salvando…' : 'Adicionar'}
        </button>
      </form>
    </Cartao>
  )
}
