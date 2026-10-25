import { formatBRL } from '../domain/money'
import type { IsoDate, TransactionStatus } from '../domain/types'

export const dinheiro = formatBRL

/**
 * Formata a data civil sem passar por fuso. `new Date('2026-09-18')` é
 * meia-noite UTC, que em São Paulo ainda é dia 17 — o erro mais comum em
 * aplicação financeira brasileira.
 */
function partes(data: IsoDate): { dia: string; mes: number; ano: string } {
  const [ano, mes, dia] = data.split('-')
  return { dia, mes: Number(mes), ano }
}

export function dataCurta(data: IsoDate): string {
  const { dia, mes, ano } = partes(data)
  return `${dia}/${String(mes).padStart(2, '0')}/${ano}`
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

export function dataLonga(data: IsoDate): string {
  const { dia, mes, ano } = partes(data)
  return `${Number(dia)} de ${MESES[mes - 1]} de ${ano}`
}

/**
 * Texto e ícone para cada estado. Nunca só cor (§14): quem não distingue
 * vermelho de verde ainda precisa saber que a conta está atrasada.
 */
export function rotuloStatus(
  status: TransactionStatus,
  atrasado: boolean,
): { texto: string; icone: string } {
  if (atrasado) return { texto: 'Atrasado', icone: '⚠' }

  const rotulos: Record<TransactionStatus, { texto: string; icone: string }> = {
    previsto: { texto: 'Previsto', icone: '◷' },
    pendente: { texto: 'Pendente', icone: '◐' },
    liquidado: { texto: 'Liquidado', icone: '✓' },
    conciliado: { texto: 'Conciliado', icone: '✓✓' },
    cancelado: { texto: 'Cancelado', icone: '✕' },
    estornado: { texto: 'Estornado', icone: '↩' },
  }
  return rotulos[status]
}
