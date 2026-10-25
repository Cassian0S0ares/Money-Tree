'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { desfazer, salvarLancamento, type EstadoFormularioLancamento } from './acoes'
import { ToastDesfazer } from '../../../components/toast'
import { Aviso, Cartao, Dica, Rotulo, classeEntrada, classesBotao } from '../../../components/ui'
import type { Conta } from '../../../data/accounts'
import type { Categoria } from '../../../data/categories'
import type { TransactionKind } from '../../../domain/types'

const TIPOS: { valor: TransactionKind; rotulo: string; icone: string }[] = [
  { valor: 'despesa', rotulo: 'Despesa', icone: '−' },
  { valor: 'receita', rotulo: 'Receita', icone: '+' },
  { valor: 'transferencia', rotulo: 'Transferência', icone: '⇄' },
  { valor: 'ajuste', rotulo: 'Ajuste', icone: '±' },
]

const INICIAL: EstadoFormularioLancamento = {}

/** Categorias do tipo, com as subcategorias logo abaixo do grupo. */
function opcoesCategoria(categorias: Categoria[], kind: 'receita' | 'despesa') {
  const doTipo = categorias.filter((categoria) => categoria.kind === kind)
  return doTipo
    .filter((categoria) => categoria.parentId === null)
    .flatMap((raiz) => [
      { id: raiz.id, rotulo: raiz.name },
      ...doTipo
        .filter((filha) => filha.parentId === raiz.id)
        .map((filha) => ({ id: filha.id, rotulo: `${raiz.name} › ${filha.name}` })),
    ])
}

export function FormularioLancamento({
  contas,
  categorias,
  hoje,
}: {
  contas: Conta[]
  categorias: Categoria[]
  hoje: string
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
  const invalido = (campo: string) => (estado.campoInvalido === campo ? true : undefined)

  const ehTransferencia = tipo === 'transferencia'
  const ehAjuste = tipo === 'ajuste'
  const aceitaCategoria = !ehTransferencia && !ehAjuste
  // Com uma conta só, escolher é cerimônia: ela já vem selecionada.
  const contaPadrao = contas.length === 1 ? contas[0].id : ''

  return (
    <>
      <Cartao className="max-w-2xl p-6">
        <form key={estado.chave} action={acao} className="space-y-6">
          {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}

          <fieldset>
            <legend className="text-sm font-medium text-slate-800">Tipo</legend>
            {/* Rádios de verdade, só com cara de botões segmentados: setas do
                teclado e leitor de tela funcionam como em qualquer grupo. */}
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TIPOS.map((opcao) => (
                <label
                  key={opcao.valor}
                  className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 has-[:checked]:border-marca-700 has-[:checked]:bg-marca-50 has-[:checked]:text-marca-900 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-marca-800"
                >
                  <input
                    type="radio" name="kind" value={opcao.valor} className="sr-only"
                    checked={tipo === opcao.valor}
                    onChange={() => setTipo(opcao.valor)}
                  />
                  <span aria-hidden="true">{opcao.icone}</span>
                  {opcao.rotulo}
                </label>
              ))}
            </div>
            {ehTransferencia && (
              <Dica>
                Transferência move dinheiro entre contas suas. Não é receita nem despesa, e por
                isso não leva categoria.
              </Dica>
            )}
            {ehAjuste && (
              <Dica>
                Ajuste corrige o saldo quando ele não bate com a realidade. Prefira registrar o
                lançamento que falta; ajuste é a saída quando isso não é possível.
              </Dica>
            )}
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-[1fr_12rem]">
            <div>
              <Rotulo htmlFor="description">Descrição</Rotulo>
              <input
                id="description" name="description" required
                placeholder={ehTransferencia ? 'Ex.: Reserva de emergência' : 'Ex.: Mercado da semana'}
                autoFocus={invalido('description')} aria-invalid={invalido('description')}
                defaultValue={v.description ?? ''}
                className={classeEntrada}
              />
            </div>

            <div>
              <Rotulo htmlFor="valor">Valor</Rotulo>
              <div className="relative">
                <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 mt-0.5 -translate-y-1/2 text-sm text-slate-500">
                  R$
                </span>
                <input
                  id="valor" name="valor" inputMode="decimal" placeholder="0,00" required
                  aria-describedby="valor-dica"
                  autoFocus={invalido('valor')} aria-invalid={invalido('valor')}
                  defaultValue={v.valor ?? ''}
                  className={`${classeEntrada} pl-10 text-right text-lg font-medium tabular-nums`}
                />
              </div>
              <Dica id="valor-dica">Sempre positivo.</Dica>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Rotulo htmlFor="accountId">{ehTransferencia ? 'Sai de' : 'Conta'}</Rotulo>
              <select
                id="accountId" name="accountId" required
                aria-invalid={invalido('accountId')}
                defaultValue={v.accountId ?? contaPadrao}
                className={classeEntrada}
              >
                <option value="">Escolha…</option>
                {contas.map((conta) => (
                  <option key={conta.id} value={conta.id}>{conta.name}</option>
                ))}
              </select>
            </div>

            {ehTransferencia ? (
              <div>
                <Rotulo htmlFor="toAccountId">Entra em</Rotulo>
                <select
                  id="toAccountId" name="toAccountId" required
                  aria-invalid={invalido('toAccountId')}
                  defaultValue={v.toAccountId ?? ''}
                  className={classeEntrada}
                >
                  <option value="">Escolha…</option>
                  {contas.map((conta) => (
                    <option key={conta.id} value={conta.id}>{conta.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <Rotulo htmlFor="competenceDate">Data</Rotulo>
                <input
                  id="competenceDate" name="competenceDate" type="date" required
                  aria-invalid={invalido('competenceDate')}
                  defaultValue={v.competenceDate ?? hoje}
                  className={classeEntrada}
                />
              </div>
            )}
          </div>

          {ehTransferencia && (
            <div className="sm:w-1/2 sm:pr-2.5">
              <Rotulo htmlFor="competenceDate">Data</Rotulo>
              <input
                id="competenceDate" name="competenceDate" type="date" required
                aria-invalid={invalido('competenceDate')}
                defaultValue={v.competenceDate ?? hoje}
                className={classeEntrada}
              />
            </div>
          )}

          {aceitaCategoria && (
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <Rotulo htmlFor="categoryId">Categoria</Rotulo>
                <select
                  id="categoryId" name="categoryId" defaultValue={v.categoryId ?? ''}
                  className={classeEntrada}
                >
                  <option value="">Sem categoria</option>
                  {opcoesCategoria(categorias, tipo === 'receita' ? 'receita' : 'despesa').map((opcao) => (
                    <option key={opcao.id} value={opcao.id}>{opcao.rotulo}</option>
                  ))}
                </select>
              </div>

              <div>
                <Rotulo htmlFor="nature">Natureza</Rotulo>
                <select
                  id="nature" name="nature" defaultValue={v.nature ?? 'variavel'}
                  aria-describedby="nature-dica"
                  className={classeEntrada}
                >
                  <option value="variavel">Variável</option>
                  <option value="fixa">Fixa</option>
                </select>
                <Dica id="nature-dica">Fixa se repete todo mês com valor parecido.</Dica>
              </div>
            </div>
          )}

          {ehAjuste && (
            <div className="grid gap-5 sm:grid-cols-[12rem_1fr]">
              <div>
                <Rotulo htmlFor="direcaoAjuste">Efeito no saldo</Rotulo>
                <select
                  id="direcaoAjuste" name="direcaoAjuste" defaultValue={v.direcaoAjuste ?? '1'}
                  className={classeEntrada}
                >
                  <option value="1">Aumenta</option>
                  <option value="-1">Reduz</option>
                </select>
              </div>
              <div>
                <Rotulo htmlFor="adjustmentReason">Motivo do ajuste</Rotulo>
                <input
                  id="adjustmentReason" name="adjustmentReason" required
                  aria-describedby="adjustmentReason-dica"
                  aria-invalid={invalido('adjustmentReason')}
                  defaultValue={v.adjustmentReason ?? ''}
                  className={classeEntrada}
                />
                <Dica id="adjustmentReason-dica">
                  Fica registrado: ajuste sem explicação reescreve o histórico em silêncio.
                </Dica>
              </div>
            </div>
          )}

          <div className="grid gap-5 border-t border-slate-100 pt-5 sm:grid-cols-2">
            <div>
              <Rotulo htmlFor="status">Situação</Rotulo>
              <select
                id="status" name="status" value={status} onChange={(e) => setStatus(e.target.value)}
                aria-describedby="status-dica"
                className={classeEntrada}
              >
                <option value="liquidado">Já pago ou recebido</option>
                <option value="pendente">Pendente</option>
                <option value="previsto">Previsto</option>
              </select>
              <Dica id="status-dica">
                {status === 'liquidado'
                  ? 'Entra no saldo da conta agora.'
                  : 'Não entra no saldo até ser marcado como liquidado.'}
              </Dica>
            </div>

            {status === 'liquidado' && (
              <div>
                <Rotulo htmlFor="settledDate" opcional>Data do pagamento</Rotulo>
                <input
                  id="settledDate" name="settledDate" type="date"
                  aria-describedby="settledDate-dica"
                  defaultValue={v.settledDate ?? ''}
                  className={classeEntrada}
                />
                <Dica id="settledDate-dica">Vazio usa a data do lançamento.</Dica>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={enviando} className={classesBotao('primario')}>
              {enviando ? 'Salvando…' : 'Salvar lançamento'}
            </button>
            <Link href="/lancamentos" className={classesBotao('fantasma')}>
              Ver lançamentos
            </Link>
          </div>
        </form>
      </Cartao>

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
