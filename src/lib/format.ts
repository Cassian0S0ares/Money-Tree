import { formatBRL } from '../domain/money'
import type { AccountType, Cents, IsoDate, TransactionStatus } from '../domain/types'

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

const TIPOS_CONTA: Record<AccountType, string> = {
  corrente: 'Conta corrente',
  pagamento: 'Conta de pagamento',
  poupanca: 'Poupança',
  carteira: 'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  investimento: 'Investimento',
  emprestimo: 'Empréstimo',
  outro: 'Outro',
}

export function rotuloTipoConta(tipo: AccountType): string {
  return TIPOS_CONTA[tipo]
}

/**
 * Centavos no formato que o campo de valor aceita ("1.234,56"), sem passar
 * por ponto flutuante: `(c / 100).toFixed(2)` arredonda em binário.
 */
export function valorParaEntrada(valor: Cents): string {
  const absoluto = Math.abs(valor)
  const reais = Math.trunc(absoluto / 100).toLocaleString('pt-BR')
  const centavos = String(absoluto % 100).padStart(2, '0')
  return `${valor < 0 ? '-' : ''}${reais},${centavos}`
}

/**
 * Nome do período para o título. Com o mês começando no dia 1 é só o mês
 * ("outubro de 2026"); com outro dia, o intervalo, para não haver dúvida
 * sobre onde termina ("5 de outubro a 4 de novembro de 2026").
 */
export function rotuloPeriodo(inicio: IsoDate, fim: IsoDate): string {
  const de = partes(inicio)
  const ate = partes(fim)
  if (de.dia === '01' && ate.mes === de.mes) return `${MESES[de.mes - 1]} de ${de.ano}`
  const anoDe = de.ano === ate.ano ? '' : ` de ${de.ano}`
  return `${Number(de.dia)} de ${MESES[de.mes - 1]}${anoDe} a ${Number(ate.dia)} de ${MESES[ate.mes - 1]} de ${ate.ano}`
}

/** Mês e ano de uma data ("março de 2028"), para o mês provável das metas. */
export function mesAno(data: IsoDate): string {
  const { mes, ano } = partes(data)
  return `${MESES[mes - 1]} de ${ano}`
}
