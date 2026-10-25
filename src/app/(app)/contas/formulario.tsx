'use client'

import { useActionState, useState } from 'react'
import { salvarConta, type EstadoFormularioConta } from './acoes'
import type { Conta } from '../../../data/accounts'

const TIPOS = [
  { valor: 'corrente', rotulo: 'Conta corrente' },
  { valor: 'pagamento', rotulo: 'Conta de pagamento' },
  { valor: 'poupanca', rotulo: 'Poupança' },
  { valor: 'carteira', rotulo: 'Dinheiro / carteira' },
  { valor: 'cartao_credito', rotulo: 'Cartão de crédito' },
  { valor: 'investimento', rotulo: 'Investimento' },
  { valor: 'emprestimo', rotulo: 'Empréstimo ou financiamento' },
  { valor: 'outro', rotulo: 'Outro ativo ou dívida' },
]

/** Espelha o gatilho `accounts_padroes_por_tipo` da migração 002. */
const LIQUIDOS = new Set(['corrente', 'pagamento', 'poupanca', 'carteira'])

const INICIAL: EstadoFormularioConta = {}

export function FormularioConta({ conta }: { conta?: Conta }) {
  const [estado, acao, enviando] = useActionState(salvarConta, INICIAL)
  const v = estado.valores ?? {}

  // Na conta nova, o padrão de "incluir no disponível" segue o tipo: cartão
  // marcado por descuido somaria limite de crédito ao dinheiro (§5.7). Mexer
  // no checkbox à mão vale até a próxima troca de tipo.
  const [incluir, setIncluir] = useState(
    conta?.includeInAvailable ?? LIQUIDOS.has(v.type ?? 'corrente'),
  )

  return (
    <form action={acao} className="max-w-lg space-y-4">
      {conta && <input type="hidden" name="id" value={conta.id} />}

      {estado.erro && (
        <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <span aria-hidden="true">⚠ </span>
          {estado.erro}
        </p>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium">Nome</label>
        <input
          id="name" name="name" required autoFocus={estado.campoInvalido === 'name'}
          defaultValue={v.name ?? conta?.name ?? ''}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        />
      </div>

      <div>
        <label htmlFor="type" className="block text-sm font-medium">Tipo</label>
        <select
          id="type" name="type" required
          defaultValue={v.type ?? conta?.type ?? 'corrente'}
          onChange={(evento) => {
            if (!conta) setIncluir(LIQUIDOS.has(evento.target.value))
          }}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        >
          {TIPOS.map((tipo) => (
            <option key={tipo.valor} value={tipo.valor}>{tipo.rotulo}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="institution" className="block text-sm font-medium">
          Instituição <span className="text-slate-500">(opcional)</span>
        </label>
        <input
          id="institution" name="institution"
          defaultValue={v.institution ?? conta?.institution ?? ''}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="saldoInicial" className="block text-sm font-medium">Saldo inicial</label>
          <input
            id="saldoInicial" name="saldoInicial" inputMode="decimal" placeholder="0,00"
            autoFocus={estado.campoInvalido === 'saldoInicial'}
            defaultValue={
              v.saldoInicial ??
              (conta ? (conta.initialBalanceCents / 100).toFixed(2).replace('.', ',') : '')
            }
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
          <p className="mt-1 text-xs text-slate-500">Use vírgula para os centavos.</p>
        </div>

        <div>
          <label htmlFor="initialBalanceDate" className="block text-sm font-medium">
            Data do saldo inicial
          </label>
          <input
            id="initialBalanceDate" name="initialBalanceDate" type="date" required
            defaultValue={v.initialBalanceDate ?? conta?.initialBalanceDate ?? ''}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>
      </div>

      <div className="flex items-start gap-2">
        <input
          id="includeInAvailable" name="includeInAvailable" type="checkbox"
          checked={incluir}
          onChange={(evento) => setIncluir(evento.target.checked)}
          className="mt-1"
        />
        <label htmlFor="includeInAvailable" className="text-sm">
          Incluir no dinheiro disponível
          <span className="block text-xs text-slate-500">
            Cartão de crédito e investimento sem liquidez ficam de fora por padrão. Limite de
            crédito não é dinheiro disponível.
          </span>
        </label>
      </div>

      <button
        type="submit" disabled={enviando}
        className="rounded bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-60"
      >
        {enviando ? 'Salvando…' : 'Salvar conta'}
      </button>
    </form>
  )
}
