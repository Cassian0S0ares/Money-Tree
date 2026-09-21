import type { Cents } from './types'

export class ValorInvalidoError extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ValorInvalidoError'
  }
}

/** Marca um inteiro como Cents. Lança se não for inteiro finito. */
export function cents(valor: number): Cents {
  if (!Number.isFinite(valor) || !Number.isInteger(valor)) {
    throw new ValorInvalidoError(`Valor precisa ser inteiro de centavos, recebido: ${valor}`)
  }
  return valor as Cents
}

const FORMATADOR = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export function formatBRL(valor: Cents): string {
  return FORMATADOR.format(valor / 100)
}

/**
 * Interpreta entrada pt-BR. Aceita separador de milhar, símbolo da moeda e
 * espaço não separável. Rejeita mais de duas casas decimais: arredondar em
 * silêncio é como centavo some.
 */
export function parseBRL(entrada: string): Cents {
  const limpo = entrada
    .replace(/[R$\s ]/g, '')
    .replace(/\./g, '')
    .trim()

  if (limpo === '' || !/^-?\d+(,\d{1,2})?$/.test(limpo)) {
    throw new ValorInvalidoError(`Valor monetário inválido: "${entrada}"`)
  }

  const negativo = limpo.startsWith('-')
  const [inteiros, decimais = ''] = limpo.replace('-', '').split(',')
  const centavos = Number(inteiros) * 100 + Number(decimais.padEnd(2, '0'))

  return cents(negativo ? -centavos : centavos)
}

export function addCents(a: Cents, b: Cents): Cents {
  return cents(a + b)
}

export function subCents(a: Cents, b: Cents): Cents {
  return cents(a - b)
}

export function negate(a: Cents): Cents {
  return cents(-a)
}

export function sumCents(valores: Cents[]): Cents {
  return cents(valores.reduce<number>((total, valor) => total + valor, 0))
}

/**
 * Divide um total em N partes sem perder nem inventar centavo.
 * O resto da divisão é distribuído uma unidade por vez, começando pela
 * primeira parte. A soma das partes é sempre exatamente o total.
 */
export function rateio(total: Cents, partes: number): Cents[] {
  if (!Number.isInteger(partes) || partes < 1) {
    throw new ValorInvalidoError(`Número de partes precisa ser inteiro positivo, recebido: ${partes}`)
  }

  const sinal = total < 0 ? -1 : 1
  const absoluto = Math.abs(total)
  const base = Math.floor(absoluto / partes)
  const resto = absoluto - base * partes

  return Array.from({ length: partes }, (_, indice) =>
    cents(sinal * (base + (indice < resto ? 1 : 0))),
  )
}
