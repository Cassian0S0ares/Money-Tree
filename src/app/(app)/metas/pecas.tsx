import type { AvaliacaoMeta, GoalKind, GoalPriority, SituacaoMeta } from '../../../domain/goal'
import type { Cents, IsoDate } from '../../../domain/types'
import { dataLonga, dinheiro, mesAno } from '../../../lib/format'

/**
 * Peças das telas de metas (spec da fatia 4, seções 6.3, 6.7 e 8). O tipo
 * da meta é só rótulo e ícone; a situação vem sempre com ícone e texto,
 * nunca só cor (§14).
 */

export const TIPOS_META: Record<GoalKind, { rotulo: string; icone: string }> = {
  reserva_emergencia: { rotulo: 'Reserva de emergência', icone: '☂' },
  viagem: { rotulo: 'Viagem', icone: '✈' },
  compra: { rotulo: 'Compra planejada', icone: '◆' },
  quitacao_divida: { rotulo: 'Quitação de dívida', icone: '⊘' },
  educacao: { rotulo: 'Educação', icone: '✎' },
  longo_prazo: { rotulo: 'Longo prazo', icone: '◷' },
  livre: { rotulo: 'Meta livre', icone: '★' },
}

export const PRIORIDADES: Record<GoalPriority, string> = {
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
}

export function TipoMeta({ kind }: { kind: GoalKind }) {
  const tipo = TIPOS_META[kind]
  return (
    <span className="inline-flex items-center gap-1 text-sm text-slate-600">
      <span aria-hidden="true">{tipo.icone}</span>
      {tipo.rotulo}
    </span>
  )
}

const SITUACOES: Record<SituacaoMeta, { icone: string; classe: string; barra: string }> = {
  atingida: { icone: '✓', classe: 'text-marca-800', barra: 'bg-marca-600' },
  no_prazo: { icone: '✓', classe: 'text-marca-800', barra: 'bg-marca-600' },
  sem_prazo: { icone: '◌', classe: 'text-slate-700', barra: 'bg-marca-600' },
  fora_do_prazo: { icone: '⚠', classe: 'text-amber-800', barra: 'bg-amber-500' },
  prazo_vencido: { icone: '✕', classe: 'text-red-800', barra: 'bg-red-600' },
}

export function textoSituacaoMeta(avaliacao: AvaliacaoMeta, dataAlvo: IsoDate | null): string {
  switch (avaliacao.situacao) {
    case 'atingida':
      return 'Meta atingida'
    case 'prazo_vencido':
      return `O prazo passou; faltam ${dinheiro(avaliacao.falta)}`
    case 'fora_do_prazo':
      return `No ritmo atual, não fecha até ${dataLonga(dataAlvo!)}`
    case 'no_prazo':
      return `No ritmo atual, conclui em ${mesAno(avaliacao.mesProvavel!.inicio)}`
    case 'sem_prazo':
      return avaliacao.ritmo && avaliacao.mesProvavel
        ? `Sem data-alvo; no ritmo atual, conclui em ${mesAno(avaliacao.mesProvavel.inicio)}`
        : 'Sem data-alvo'
  }
}

export function SituacaoDaMeta({ avaliacao, dataAlvo }: { avaliacao: AvaliacaoMeta; dataAlvo: IsoDate | null }) {
  const estilo = SITUACOES[avaliacao.situacao]
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-medium ${estilo.classe}`}>
      <span aria-hidden="true">{estilo.icone}</span>
      {textoSituacaoMeta(avaliacao, dataAlvo)}
    </span>
  )
}

/** Frase do ritmo usado, sempre como estimativa (spec 6.3). */
export function textoRitmo(avaliacao: AvaliacaoMeta): string | null {
  if (avaliacao.atingida) return null
  if (avaliacao.ritmo === null) return 'Sem ritmo para estimar a data'
  return avaliacao.ritmo.origem === 'planejado'
    ? `No ritmo planejado de ${dinheiro(avaliacao.ritmo.valor)}/mês`
    : `Na média dos últimos 3 meses, ${dinheiro(avaliacao.ritmo.valor)}/mês`
}

export function meses(n: number): string {
  return n === 1 ? '1 mês' : `${n} meses`
}

/** Barra de progresso com o mesmo texto para quem lê e quem ouve. */
export function BarraMeta({
  nome,
  reservado,
  alvo,
  avaliacao,
}: {
  nome: string
  reservado: Cents
  alvo: Cents
  avaliacao: AvaliacaoMeta
}) {
  const texto = `${dinheiro(reservado)} de ${dinheiro(alvo)}, ${avaliacao.percentual}%`
  return (
    <div className="space-y-1">
      <div
        role="meter"
        aria-label={`Reservado para ${nome}`}
        aria-valuemin={0}
        aria-valuemax={alvo}
        aria-valuenow={Math.max(0, Math.min(reservado, alvo))}
        aria-valuetext={texto}
        className="relative h-3 w-full overflow-hidden rounded-full bg-slate-100"
      >
        <div
          className={`absolute inset-y-0 left-0 ${SITUACOES[avaliacao.situacao].barra}`}
          style={{ width: `${avaliacao.percentual}%` }}
        />
      </div>
      <p aria-hidden="true" className="text-sm text-slate-700 tabular-nums">{texto}</p>
    </div>
  )
}

/** Avisos de reserva acima do saldo, por conta (spec 3.3). */
export function AvisosAcimaDoSaldo({
  reservas,
}: {
  reservas: { accountId: string; accountName: string; acimaDoSaldo: Cents }[]
}) {
  const acima = reservas.filter((r) => r.acimaDoSaldo > 0)
  if (acima.length === 0) return null
  return (
    <ul className="space-y-1">
      {acima.map((r) => (
        <li key={r.accountId} className="flex items-center gap-1 text-sm font-medium text-amber-800">
          <span aria-hidden="true">⚠</span>
          <span className="[overflow-wrap:anywhere]">
            {r.accountName}: Reservado maior que o saldo da conta em {dinheiro(r.acimaDoSaldo)}
          </span>
        </li>
      ))}
    </ul>
  )
}
