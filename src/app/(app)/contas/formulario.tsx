'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { salvarConta, type EstadoFormularioConta } from './acoes'
import type { Conta } from '../../../data/accounts'
import { valorParaEntrada } from '../../../lib/format'
import { Aviso, Cartao, Dica, Rotulo, classeEntrada, classesBotao } from '../../../components/ui'

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

export function FormularioConta({ conta, hoje }: { conta?: Conta; hoje: string }) {
  // O React 19 reseta o formulário depois da ação, e <select> não volta ao
  // defaultValue. Remontar a cada resposta faz todo campo reaplicar o que o
  // usuário tinha digitado (§13).
  const [estado, acao, enviando] = useActionState(
    async (anterior: EstadoFormularioConta, formData: FormData) => ({
      ...(await salvarConta(anterior, formData)),
      chave: (anterior.chave ?? 0) + 1,
    }),
    INICIAL,
  )
  const v = estado.valores ?? {}
  const invalido = (campo: string) => (estado.campoInvalido === campo ? true : undefined)

  // Na conta nova, o padrão de "incluir no disponível" segue o tipo: cartão
  // marcado por descuido somaria limite de crédito ao dinheiro (§5.7). Mexer
  // no checkbox à mão vale até a próxima troca de tipo.
  const [incluir, setIncluir] = useState(
    conta?.includeInAvailable ?? LIQUIDOS.has(v.type ?? 'corrente'),
  )

  return (
    <Cartao className="max-w-2xl p-6">
      <form key={estado.chave} action={acao} className="space-y-5">
        {conta && <input type="hidden" name="id" value={conta.id} />}

        {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Rotulo htmlFor="name">Nome</Rotulo>
            <input
              id="name" name="name" required placeholder="Ex.: Conta do salário"
              autoFocus={invalido('name')} aria-invalid={invalido('name')}
              defaultValue={v.name ?? conta?.name ?? ''}
              className={classeEntrada}
            />
          </div>

          <div>
            <Rotulo htmlFor="type">Tipo</Rotulo>
            <select
              id="type" name="type" required
              defaultValue={v.type ?? conta?.type ?? 'corrente'}
              onChange={(evento) => {
                if (!conta) setIncluir(LIQUIDOS.has(evento.target.value))
              }}
              className={classeEntrada}
            >
              {TIPOS.map((tipo) => (
                <option key={tipo.valor} value={tipo.valor}>{tipo.rotulo}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <Rotulo htmlFor="institution" opcional>Instituição</Rotulo>
          <input
            id="institution" name="institution" placeholder="Ex.: Banco do Brasil"
            defaultValue={v.institution ?? conta?.institution ?? ''}
            className={classeEntrada}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Rotulo htmlFor="saldoInicial">Saldo inicial</Rotulo>
            <div className="relative">
              <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 mt-0.5 -translate-y-1/2 text-sm text-slate-500">
                R$
              </span>
              <input
                id="saldoInicial" name="saldoInicial" inputMode="decimal" placeholder="0,00"
                aria-describedby="saldoInicial-dica"
                autoFocus={invalido('saldoInicial')} aria-invalid={invalido('saldoInicial')}
                defaultValue={v.saldoInicial ?? (conta ? valorParaEntrada(conta.initialBalanceCents) : '')}
                className={`${classeEntrada} pl-10 tabular-nums`}
              />
            </div>
            <Dica id="saldoInicial-dica">
              Quanto havia na conta nessa data. Negativo para dívida, como fatura em aberto.
            </Dica>
          </div>

          <div>
            <Rotulo htmlFor="initialBalanceDate">Data do saldo inicial</Rotulo>
            <input
              id="initialBalanceDate" name="initialBalanceDate" type="date" required
              aria-invalid={invalido('initialBalanceDate')}
              defaultValue={v.initialBalanceDate ?? conta?.initialBalanceDate ?? hoje}
              className={classeEntrada}
            />
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <input
            id="includeInAvailable" name="includeInAvailable" type="checkbox"
            aria-describedby="includeInAvailable-dica"
            checked={incluir}
            onChange={(evento) => setIncluir(evento.target.checked)}
            className="mt-0.5 size-5 accent-marca-700"
          />
          <div>
            <label htmlFor="includeInAvailable" className="text-sm font-medium text-slate-900">
              Incluir no saldo disponível
            </label>
            <p id="includeInAvailable-dica" className="text-xs text-slate-600">
              Cartão de crédito e investimento sem liquidez ficam de fora por padrão. Limite de
              crédito não é dinheiro disponível.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <button type="submit" disabled={enviando} className={classesBotao('primario')}>
            {enviando ? 'Salvando…' : conta ? 'Salvar alterações' : 'Cadastrar conta'}
          </button>
          <Link href="/contas" className={classesBotao('fantasma')}>
            Cancelar
          </Link>
        </div>
      </form>
    </Cartao>
  )
}
