import Link from 'next/link'
import { notFound } from 'next/navigation'
import { buscarConta } from '../../../../data/accounts'
import { listarCategorias } from '../../../../data/categories'
import { buscarLancamento } from '../../../../data/transactions'
import { hojeEm } from '../../../../domain/dates'
import { estaAtrasado } from '../../../../domain/transaction'
import type { TransactionKind } from '../../../../domain/types'
import { exigirUsuario } from '../../../../lib/session'
import { dataLonga } from '../../../../lib/format'
import { StatusBadge } from '../../../../components/status-badge'
import { FormularioConfirmado } from '../../../../components/formulario-confirmado'
import { Cartao, Dica, Rotulo, Valor, classeEntrada, classesBotao } from '../../../../components/ui'
import { estornar, marcarLiquidado } from '../acoes'

export const metadata = { title: 'Lançamento' }

const TIPOS: Record<TransactionKind, string> = {
  receita: 'Receita',
  despesa: 'Despesa',
  transferencia: 'Transferência',
  ajuste: 'Ajuste de saldo',
}

export default async function PaginaLancamento({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const usuario = await exigirUsuario()
  const lancamento = await buscarLancamento(usuario.id, id)
  if (!lancamento) notFound()

  const [conta, categorias] = await Promise.all([
    buscarConta(usuario.id, lancamento.accountId),
    lancamento.categoryId ? listarCategorias(usuario.id, { incluirArquivadas: true }) : [],
  ])
  const categoria = categorias.find((c) => c.id === lancamento.categoryId)
  const hoje = hojeEm(usuario.timezone)
  const podeLiquidar = lancamento.status === 'previsto' || lancamento.status === 'pendente'
  const podeEstornar = lancamento.status === 'liquidado' || lancamento.status === 'conciliado'

  return (
    <section className="max-w-2xl space-y-6">
      <Link href="/lancamentos" className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-marca-700 hover:underline">
        <span aria-hidden="true">←</span> Lançamentos
      </Link>

      <Cartao className="p-6">
        <p className="text-sm text-slate-600">{TIPOS[lancamento.kind]}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 [overflow-wrap:anywhere]">
          {lancamento.description}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Valor
            centavos={lancamento.amountCents}
            direcao={lancamento.direction}
            className="text-3xl font-semibold"
          />
          <StatusBadge status={lancamento.status} atrasado={estaAtrasado(lancamento, hoje)} />
        </div>

        <dl className="mt-6 grid gap-x-6 gap-y-4 border-t border-slate-100 pt-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-600">Conta</dt>
            <dd className="font-medium text-slate-900">{conta?.name ?? '—'}</dd>
          </div>
          {categoria && (
            <div>
              <dt className="text-slate-600">Categoria</dt>
              <dd className="font-medium text-slate-900">{categoria.name}</dd>
            </div>
          )}
          <div>
            <dt className="text-slate-600">Data</dt>
            <dd className="font-medium text-slate-900">{dataLonga(lancamento.competenceDate)}</dd>
          </div>
          <div>
            <dt className="text-slate-600">Pagamento</dt>
            <dd className="font-medium text-slate-900">
              {lancamento.settledDate ? dataLonga(lancamento.settledDate) : 'Ainda não liquidado'}
            </dd>
          </div>
          {lancamento.nature && (
            <div>
              <dt className="text-slate-600">Natureza</dt>
              <dd className="font-medium text-slate-900">
                {lancamento.nature === 'fixa' ? 'Fixa' : 'Variável'}
              </dd>
            </div>
          )}
          {lancamento.adjustmentReason && (
            <div className="sm:col-span-2">
              <dt className="text-slate-600">Motivo</dt>
              <dd className="font-medium text-slate-900">{lancamento.adjustmentReason}</dd>
            </div>
          )}
        </dl>
      </Cartao>

      {podeLiquidar && (
        <Cartao as="section" className="p-6">
          <h2 className="text-base font-semibold text-slate-900">Marcar como pago</h2>
          <p className="mt-1 text-sm text-slate-600">A partir daí ele passa a contar no saldo da conta.</p>
          <form action={marcarLiquidado} className="mt-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={lancamento.id} />
            <div>
              <Rotulo htmlFor="quando">Pago em</Rotulo>
              <input id="quando" name="quando" type="date" required defaultValue={hoje} className={classeEntrada} />
            </div>
            <button type="submit" className={classesBotao('primario')}>
              Marcar como liquidado
            </button>
          </form>
        </Cartao>
      )}

      {podeEstornar && (
        <Cartao as="section" className="p-6">
          <h2 className="text-base font-semibold text-slate-900">Corrigir com estorno</h2>
          <p className="mt-1 text-sm text-slate-600">
            Lançamento liquidado não é apagado. O estorno cria um lançamento de sinal oposto, e os
            dois continuam visíveis no histórico.
            {lancamento.transferGroupId && ' Por ser transferência, os dois lados são estornados juntos.'}
          </p>
          <FormularioConfirmado
            action={estornar}
            titulo="Estornar este lançamento?"
            descricao={
              lancamento.transferGroupId
                ? 'Os dois lados da transferência voltam ao saldo de antes. Isso não pode ser desfeito.'
                : 'O saldo da conta volta a ser o de antes deste lançamento. Isso não pode ser desfeito.'
            }
            rotuloConfirmar="Estornar"
            perigoso
            className="mt-4 space-y-4"
          >
            <input type="hidden" name="id" value={lancamento.id} />
            <div>
              <Rotulo htmlFor="motivo">Motivo do estorno</Rotulo>
              <input
                id="motivo" name="motivo" required aria-describedby="motivo-dica"
                placeholder="Ex.: valor digitado errado"
                className={classeEntrada}
              />
              <Dica id="motivo-dica">Fica registrado junto com o estorno.</Dica>
            </div>
            <button type="submit" className={classesBotao('perigo')}>
              Estornar lançamento
            </button>
          </FormularioConfirmado>
        </Cartao>
      )}
    </section>
  )
}
