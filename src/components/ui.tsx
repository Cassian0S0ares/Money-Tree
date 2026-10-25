import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { dinheiro } from '../lib/format'
import type { Cents } from '../domain/types'

/**
 * Peças de base da interface. Ficam juntas porque mudam juntas: um botão
 * novo precisa combinar com o campo, o cartão e o aviso ao lado.
 */

type Variante = 'primario' | 'secundario' | 'perigo' | 'fantasma'

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-marca-700 text-white hover:bg-marca-800 shadow-sm',
  secundario: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 shadow-sm',
  perigo: 'bg-red-700 text-white hover:bg-red-800 shadow-sm',
  fantasma: 'text-slate-700 hover:bg-slate-100',
}

/** Alvo mínimo de 40px de altura: toque confortável no celular (§14). */
export function classesBotao(variante: Variante = 'primario', extra = ''): string {
  return `inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTES[variante]} ${extra}`
}

export function Botao({
  variante = 'primario',
  className = '',
  type = 'button',
  ...props
}: ComponentProps<'button'> & { variante?: Variante }) {
  return <button type={type} className={classesBotao(variante, className)} {...props} />
}

export function LinkBotao({
  variante = 'primario',
  className = '',
  ...props
}: ComponentProps<typeof Link> & { variante?: Variante }) {
  return <Link className={classesBotao(variante, className)} {...props} />
}

/** Estilo único de campo, com estado inválido visível além da cor. */
export const classeEntrada =
  'mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm placeholder:text-slate-400 aria-[invalid=true]:border-red-600 aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-red-600'

export function Rotulo({
  htmlFor,
  children,
  opcional = false,
}: {
  htmlFor: string
  children: ReactNode
  opcional?: boolean
}) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-800">
      {children}
      {opcional && <span className="font-normal text-slate-500"> (opcional)</span>}
    </label>
  )
}

export function Dica({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1 text-xs text-slate-600">
      {children}
    </p>
  )
}

export function Cartao({
  children,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'section' | 'article'
}) {
  return (
    <Tag className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </Tag>
  )
}

export function CabecalhoPagina({
  titulo,
  descricao,
  acao,
}: {
  titulo: string
  descricao?: ReactNode
  acao?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{titulo}</h1>
        {descricao && <p className="mt-1 max-w-2xl text-sm text-slate-600">{descricao}</p>}
      </div>
      {acao}
    </div>
  )
}

const AVISOS = {
  erro: { classe: 'border-red-200 bg-red-50 text-red-900', icone: '⚠', papel: 'alert' },
  sucesso: { classe: 'border-marca-100 bg-marca-50 text-marca-900', icone: '✓', papel: 'status' },
  info: { classe: 'border-slate-200 bg-slate-50 text-slate-800', icone: 'ℹ', papel: 'status' },
} as const

/** Mensagem com ícone e texto: o tipo nunca depende só da cor (§14). */
export function Aviso({
  tipo,
  children,
  className = '',
}: {
  tipo: keyof typeof AVISOS
  children: ReactNode
  className?: string
}) {
  const aviso = AVISOS[tipo]
  return (
    <div role={aviso.papel} className={`flex gap-2 rounded-lg border p-3 text-sm ${aviso.classe} ${className}`}>
      <span aria-hidden="true">{aviso.icone}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/**
 * Valor em reais com sinal explícito. O sinal usa o menos matemático (−),
 * que o leitor de tela anuncia como "menos", e a cor só reforça.
 */
export function Valor({
  centavos,
  direcao,
  className = '',
}: {
  centavos: Cents
  /** Quando informado, prefixa + ou − e colore entradas. */
  direcao?: -1 | 1
  className?: string
}) {
  if (direcao === undefined) {
    return <span className={`tabular-nums ${className}`}>{dinheiro(centavos)}</span>
  }
  return (
    <span
      className={`whitespace-nowrap tabular-nums ${direcao === 1 ? 'text-marca-700' : 'text-slate-900'} ${className}`}
    >
      {direcao === 1 ? '+' : '−'} {dinheiro(centavos)}
    </span>
  )
}

/** Selo do saldo ainda não conferido com o extrato (§6.1). */
export function SeloEstimado({ curto = false }: { curto?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
      <span aria-hidden="true">≈</span>
      {curto ? 'Estimado' : 'Estimado, não conciliado'}
    </span>
  )
}

/** Marca do produto: folha estilizada, decorativa. */
export function Marca({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold text-slate-900 ${className}`}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-7" fill="none">
        <rect width="24" height="24" rx="7" className="fill-marca-700" />
        <path
          d="M12 18.5v-6m0 0c0-3.5 2.4-6 6-6.5-.3 3.7-2.6 6.3-6 6.5Zm0 0c0-2.6-1.8-4.6-4.5-5 .2 2.8 2 4.8 4.5 5Z"
          stroke="white"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Money Tree
    </span>
  )
}
