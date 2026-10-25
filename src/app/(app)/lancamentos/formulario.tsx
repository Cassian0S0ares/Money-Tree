'use client'

import { useActionState, useState } from 'react'
import { desfazer, salvarLancamento, type EstadoFormularioLancamento } from './acoes'
import { ToastDesfazer } from '../../../components/toast'
import type { Conta } from '../../../data/accounts'
import type { Categoria } from '../../../data/categories'
import type { TransactionKind } from '../../../domain/types'

const TIPOS: { valor: TransactionKind; rotulo: string }[] = [
  { valor: 'despesa', rotulo: 'Despesa' },
  { valor: 'receita', rotulo: 'Receita' },
  { valor: 'transferencia', rotulo: 'Transferência' },
  { valor: 'ajuste', rotulo: 'Ajuste de saldo' },
]

const INICIAL: EstadoFormularioLancamento = {}

export function FormularioLancamento({
  contas,
  categorias,
}: {
  contas: Conta[]
  categorias: Categoria[]
}) {
  // O React 19 reseta o formulário depois da ação, e <select> não volta ao
  // defaultValue. Remontar a cada resposta faz todo campo reaplicar o que o
  // usuário tinha digitado (§13).
  const [estado, acao, enviando] = useActionState(
    async (anterior: EstadoFormularioLancamento, formData: FormData) => ({
      ...(await salvarLancamento(anterior, formData)),
      chave: (anterior.chave ?? 0) + 1,
    }),
    INICIAL,
  )
  const [tipo, setTipo] = useState<TransactionKind>('despesa')
  const [status, setStatus] = useState('liquidado')
  const v = estado.valores ?? {}

  const ehTransferencia = tipo === 'transferencia'
  const ehAjuste = tipo === 'ajuste'
  const aceitaCategoria = !ehTransferencia && !ehAjuste

  return (
    <>
      <form key={estado.chave} action={acao} className="max-w-lg space-y-4">
        {estado.erro && (
          <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <span aria-hidden="true">⚠ </span>
            {estado.erro}
          </p>
        )}

        <fieldset>
          <legend className="text-sm font-medium">Tipo</legend>
          <div className="mt-2 flex flex-wrap gap-4">
            {TIPOS.map((opcao) => (
              <label key={opcao.valor} className="flex items-center gap-2 text-sm">
                <input
                  type="radio" name="kind" value={opcao.valor}
                  checked={tipo === opcao.valor}
                  onChange={() => setTipo(opcao.valor)}
                />
                {opcao.rotulo}
              </label>
            ))}
          </div>
          {ehTransferencia && (
            <p className="mt-2 text-xs text-slate-500">
              Transferência move dinheiro entre contas suas. Não é receita nem despesa, e por isso
              não leva categoria.
            </p>
          )}
        </fieldset>

        <div>
          <label htmlFor="description" className="block text-sm font-medium">Descrição</label>
          <input
            id="description" name="description" required
            autoFocus={estado.campoInvalido === 'description'}
            defaultValue={v.description ?? ''}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="valor" className="block text-sm font-medium">Valor</label>
            <input
              id="valor" name="valor" inputMode="decimal" placeholder="0,00" required
              autoFocus={estado.campoInvalido === 'valor'}
              defaultValue={v.valor ?? ''}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
            <p className="mt-1 text-xs text-slate-500">Sempre positivo. O tipo define o efeito.</p>
          </div>

          <div>
            <label htmlFor="competenceDate" className="block text-sm font-medium">Data</label>
            <input
              id="competenceDate" name="competenceDate" type="date" required
              defaultValue={v.competenceDate ?? ''}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </div>
        </div>

        <div>
          <label htmlFor="accountId" className="block text-sm font-medium">
            {ehTransferencia ? 'Conta de origem' : 'Conta'}
          </label>
          <select
            id="accountId" name="accountId" required defaultValue={v.accountId ?? ''}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="">Escolha…</option>
            {contas.map((conta) => (
              <option key={conta.id} value={conta.id}>{conta.name}</option>
            ))}
          </select>
        </div>

        {ehTransferencia && (
          <div>
            <label htmlFor="toAccountId" className="block text-sm font-medium">Conta de destino</label>
            <select
              id="toAccountId" name="toAccountId" required defaultValue={v.toAccountId ?? ''}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            >
              <option value="">Escolha…</option>
              {contas.map((conta) => (
                <option key={conta.id} value={conta.id}>{conta.name}</option>
              ))}
            </select>
          </div>
        )}

        {aceitaCategoria && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="categoryId" className="block text-sm font-medium">Categoria</label>
              <select
                id="categoryId" name="categoryId" defaultValue={v.categoryId ?? ''}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              >
                <option value="">Sem categoria</option>
                {categorias
                  .filter((categoria) => categoria.kind === (tipo === 'receita' ? 'receita' : 'despesa'))
                  .map((categoria) => (
                    <option key={categoria.id} value={categoria.id}>{categoria.name}</option>
                  ))}
              </select>
            </div>

            <div>
              <label htmlFor="nature" className="block text-sm font-medium">Natureza</label>
              <select
                id="nature" name="nature" defaultValue={v.nature ?? 'variavel'}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              >
                <option value="variavel">Variável</option>
                <option value="fixa">Fixa</option>
              </select>
            </div>
          </div>
        )}

        {ehAjuste && (
          <div>
            <label htmlFor="direcaoAjuste" className="block text-sm font-medium">Efeito no saldo</label>
            <select
              id="direcaoAjuste" name="direcaoAjuste" defaultValue={v.direcaoAjuste ?? '1'}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            >
              <option value="1">Aumenta o saldo</option>
              <option value="-1">Reduz o saldo</option>
            </select>
          </div>
        )}

        {ehAjuste && (
          <div>
            <label htmlFor="adjustmentReason" className="block text-sm font-medium">
              Motivo do ajuste
            </label>
            <input
              id="adjustmentReason" name="adjustmentReason" required
              defaultValue={v.adjustmentReason ?? ''}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
            <p className="mt-1 text-xs text-slate-500">
              Ajuste sem explicação reescreve o histórico em silêncio. O motivo fica registrado.
            </p>
          </div>
        )}

        <div>
          <label htmlFor="status" className="block text-sm font-medium">Situação</label>
          <select
            id="status" name="status" value={status} onChange={(e) => setStatus(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="liquidado">Já pago ou recebido</option>
            <option value="pendente">Pendente</option>
            <option value="previsto">Previsto</option>
          </select>
          {status !== 'liquidado' && (
            <p className="mt-1 text-xs text-slate-500">Não entra no saldo até ser liquidado.</p>
          )}
        </div>

        {status === 'liquidado' && (
          <div>
            <label htmlFor="settledDate" className="block text-sm font-medium">
              Data da liquidação <span className="text-slate-500">(vazio usa a data acima)</span>
            </label>
            <input
              id="settledDate" name="settledDate" type="date"
              defaultValue={v.settledDate ?? ''}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </div>
        )}

        <button
          type="submit" disabled={enviando}
          className="rounded bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {enviando ? 'Salvando…' : 'Salvar lançamento'}
        </button>
      </form>

      {estado.criadoId && (
        <ToastDesfazer
          key={estado.criadoId}
          mensagem="Lançamento registrado."
          aoDesfazer={
            estado.podeDesfazer
              ? () => {
                  const dados = new FormData()
                  dados.set('id', estado.criadoId!)
                  void desfazer(dados)
                }
              : undefined
          }
        />
      )}
    </>
  )
}
