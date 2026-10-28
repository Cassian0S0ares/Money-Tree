'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { salvarMeta, type EstadoMeta } from './acoes'
import { PRIORIDADES, TIPOS_META } from './pecas'
import { Aviso, Cartao, Dica, Rotulo, classeEntrada, classesBotao } from '../../../components/ui'

export interface ValoresMeta {
  name: string
  kind: string
  alvo: string
  data: string
  priority: string
  accountId: string
  contribuicao: string
}

const INICIAL: EstadoMeta = {}

/**
 * Criar ou alterar uma meta. Na edição, os valores podem vir de uma opção de
 * prazo (spec 6.4): ficam só no formulário; nada muda até salvar.
 */
export function FormularioMeta({
  metaId,
  padrao,
  contas,
  sugerido = false,
}: {
  metaId?: string
  padrao: ValoresMeta
  contas: { id: string; name: string }[]
  sugerido?: boolean
}) {
  // Remonta a cada resposta: o reset do React 19 não devolve <select> ao
  // defaultValue (§13).
  const [estado, acao, enviando] = useActionState(
    async (anterior: EstadoMeta, formData: FormData) => ({
      ...(await salvarMeta(anterior, formData)),
      chave: (anterior.chave ?? 0) + 1,
    }),
    INICIAL,
  )
  const v = { ...padrao, ...(estado.valores ?? {}) }
  const invalido = (campo: string) => (estado.campoInvalido === campo ? true : undefined)

  return (
    <Cartao className="max-w-2xl p-6">
      <form key={estado.chave} action={acao} className="space-y-6">
        {metaId && <input type="hidden" name="metaId" value={metaId} />}
        {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
        {sugerido && <Aviso tipo="info">Valor sugerido; nada muda até você salvar.</Aviso>}

        <div className="grid gap-5 sm:grid-cols-[1fr_14rem]">
          <div>
            <Rotulo htmlFor="name">Nome</Rotulo>
            <input
              id="name" name="name" required maxLength={80} placeholder="Ex.: Viagem para o Nordeste"
              aria-invalid={invalido('name')} autoFocus={invalido('name')}
              defaultValue={v.name} className={classeEntrada}
            />
          </div>
          <div>
            <Rotulo htmlFor="kind">Tipo</Rotulo>
            <select id="kind" name="kind" required aria-invalid={invalido('kind')} defaultValue={v.kind} className={classeEntrada}>
              {Object.entries(TIPOS_META).map(([valor, tipo]) => (
                <option key={valor} value={valor}>{tipo.rotulo}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Rotulo htmlFor="alvo">Valor-alvo</Rotulo>
            <div className="relative">
              <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 mt-0.5 -translate-y-1/2 text-sm text-slate-500">R$</span>
              <input
                id="alvo" name="alvo" inputMode="decimal" required placeholder="0,00"
                aria-invalid={invalido('alvo')} autoFocus={invalido('alvo')}
                defaultValue={v.alvo} className={`${classeEntrada} pl-10 text-right tabular-nums`}
              />
            </div>
          </div>
          <div>
            <Rotulo htmlFor="data" opcional>Data-alvo</Rotulo>
            <input
              id="data" name="data" type="date" aria-invalid={invalido('data')}
              defaultValue={v.data} className={classeEntrada}
            />
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Rotulo htmlFor="priority">Prioridade</Rotulo>
            <select id="priority" name="priority" defaultValue={v.priority} className={classeEntrada}>
              {Object.entries(PRIORIDADES).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>{rotulo}</option>
              ))}
            </select>
          </div>
          <div>
            <Rotulo htmlFor="accountId" opcional>Conta padrão das reservas</Rotulo>
            <select id="accountId" name="accountId" defaultValue={v.accountId} className={classeEntrada}>
              <option value="">Nenhuma</option>
              {contas.map((conta) => (
                <option key={conta.id} value={conta.id}>{conta.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="sm:w-1/2 sm:pr-2.5">
          <Rotulo htmlFor="contribuicao" opcional>Contribuição mensal planejada</Rotulo>
          <div className="relative">
            <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 mt-0.5 -translate-y-1/2 text-sm text-slate-500">R$</span>
            <input
              id="contribuicao" name="contribuicao" inputMode="decimal" placeholder="0,00"
              aria-invalid={invalido('contribuicao')} aria-describedby="contribuicao-dica"
              defaultValue={v.contribuicao} className={`${classeEntrada} pl-10 text-right tabular-nums`}
            />
          </div>
          <Dica id="contribuicao-dica">É um plano: não reserva nem lança nada sozinho.</Dica>
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={enviando} className={classesBotao('primario')}>
            {enviando ? 'Salvando…' : metaId ? 'Salvar meta' : 'Criar meta'}
          </button>
          <Link href={metaId ? `/metas/${metaId}` : '/metas'} className={classesBotao('fantasma')}>Cancelar</Link>
        </div>
      </form>
    </Cartao>
  )
}
