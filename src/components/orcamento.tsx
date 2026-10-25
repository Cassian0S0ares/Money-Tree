import type { Avaliacao, Situacao } from '../domain/budget'
import type { Cents } from '../domain/types'
import { dinheiro } from '../lib/format'

/**
 * Peças visuais do orçamento. A situação nunca depende só da cor (§5.5,
 * §14): toda barra vem com o texto ao lado, e o leitor de tela recebe o
 * mesmo por `aria-valuetext`.
 */

const SITUACOES: Record<Situacao, { icone: string; classe: string; barra: string }> = {
  dentro: { icone: '✓', classe: 'text-marca-800', barra: 'bg-marca-600' },
  atencao: { icone: '⚠', classe: 'text-amber-800', barra: 'bg-amber-500' },
  vai_estourar: { icone: '↗', classe: 'text-orange-800', barra: 'bg-orange-500' },
  estourado: { icone: '✕', classe: 'text-red-800', barra: 'bg-red-600' },
}

export function textoSituacao(avaliacao: Avaliacao, disponivel: Cents, realizado: Cents): string {
  switch (avaliacao.situacao) {
    case 'estourado':
      return `Estourou em ${dinheiro((realizado - disponivel) as Cents)}`
    case 'vai_estourar':
      return `No ritmo atual, estoura em ${dinheiro(avaliacao.estouroPrevisto!)}`
    case 'atencao':
      return avaliacao.motivo === 'comprometido' ? 'O comprometido passa do limite' : 'Gastando acima do ritmo'
    case 'dentro':
      return 'Dentro do orçamento'
  }
}

export function SituacaoOrcamento({
  avaliacao,
  disponivel,
  realizado,
}: {
  avaliacao: Avaliacao
  disponivel: Cents
  realizado: Cents
}) {
  const estilo = SITUACOES[avaliacao.situacao]
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-medium ${estilo.classe}`}>
      <span aria-hidden="true">{estilo.icone}</span>
      {textoSituacao(avaliacao, disponivel, realizado)}
    </span>
  )
}

const largura = (parte: number, total: number) =>
  total <= 0 ? (parte > 0 ? 100 : 0) : Math.min(100, Math.max(0, (parte * 100) / total))

/**
 * Barra: realizado preenchido, comprometido em faixa listrada logo depois,
 * e um traço vertical marcando o esperado para hoje.
 */
export function BarraOrcamento({
  nome,
  disponivel,
  realizado,
  comprometido,
  avaliacao,
}: {
  nome: string
  disponivel: Cents
  realizado: Cents
  comprometido: Cents
  avaliacao: Avaliacao
}) {
  const realizadoPct = largura(realizado, disponivel)
  const comprometidoPct = Math.min(100 - realizadoPct, largura(comprometido, disponivel))
  const esperadoPct = avaliacao.esperadoHoje === null ? null : largura(avaliacao.esperadoHoje, disponivel)
  const percentual = avaliacao.percentual === null ? '' : `, ${avaliacao.percentual}%`

  return (
    <div
      role="meter"
      aria-label={`Gasto em ${nome}`}
      aria-valuemin={0}
      aria-valuemax={disponivel}
      aria-valuenow={Math.min(realizado, disponivel)}
      aria-valuetext={`${dinheiro(realizado)} de ${dinheiro(disponivel)}${percentual}`}
      className="relative h-3 w-full overflow-hidden rounded-full bg-slate-100"
    >
      <div
        className={`absolute inset-y-0 left-0 ${SITUACOES[avaliacao.situacao].barra}`}
        style={{ width: `${realizadoPct}%` }}
      />
      {comprometidoPct > 0 && (
        <div
          className="absolute inset-y-0 bg-[repeating-linear-gradient(45deg,var(--color-slate-400)_0_3px,transparent_3px_6px)]"
          style={{ left: `${realizadoPct}%`, width: `${comprometidoPct}%` }}
        />
      )}
      {esperadoPct !== null && (
        <div
          aria-hidden="true"
          className="absolute inset-y-0 w-0.5 bg-slate-900"
          style={{ left: `calc(${esperadoPct}% - 1px)` }}
        />
      )}
    </div>
  )
}
