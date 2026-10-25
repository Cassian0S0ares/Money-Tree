import type { ReactNode } from 'react'
import { classesBotao } from './ui'

/**
 * Os estados que o §13 exige em toda área de dados. Estão juntos num
 * arquivo porque mudam juntos: a linguagem de um precisa combinar com a dos
 * outros.
 */

/** Esqueleto no formato do conteúdo, com texto para o leitor de tela. */
export function Carregando({ rotulo = 'Carregando' }: { rotulo?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">{rotulo}…</span>
      <div aria-hidden="true" className="h-8 w-48 animate-pulse rounded-lg bg-slate-200" />
      <div aria-hidden="true" className="h-28 animate-pulse rounded-xl bg-slate-200/70" />
      <div aria-hidden="true" className="space-y-2">
        {[0, 1, 2].map((linha) => (
          <div key={linha} className="h-14 animate-pulse rounded-xl bg-slate-200/50" />
        ))}
      </div>
    </div>
  )
}

export function SemDados({
  titulo,
  descricao,
  acao,
}: {
  titulo: string
  descricao: string
  acao?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <div
        aria-hidden="true"
        className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-marca-50 text-xl text-marca-700"
      >
        ✦
      </div>
      <p className="font-semibold text-slate-900">{titulo}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">{descricao}</p>
      {acao && <div className="mt-6 flex justify-center">{acao}</div>}
    </div>
  )
}

export function SemResultados({ acao }: { acao?: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
      <p className="font-medium text-slate-900">Nenhum lançamento com esses filtros</p>
      <p className="mt-1 text-sm text-slate-600">Amplie o período ou limpe os filtros.</p>
      {acao && <div className="mt-4 flex justify-center">{acao}</div>}
    </div>
  )
}

/**
 * O §13 exige três coisas na mensagem de erro: o que aconteceu, o que foi
 * preservado e como corrigir. As três são obrigatórias na assinatura, para
 * que não seja possível esquecer uma.
 */
export function ErroRecuperavel({
  oQueAconteceu,
  oQueFoiPreservado,
  comoCorrigir,
  aoTentarNovamente,
}: {
  oQueAconteceu: string
  oQueFoiPreservado: string
  comoCorrigir: string
  aoTentarNovamente?: () => void
}) {
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5">
      <p className="font-semibold text-red-900">
        <span aria-hidden="true">⚠ </span>
        {oQueAconteceu}
      </p>
      <p className="mt-2 text-sm text-red-900">{oQueFoiPreservado}</p>
      <p className="mt-1 text-sm text-red-900">{comoCorrigir}</p>
      {aoTentarNovamente && (
        <button type="button" onClick={aoTentarNovamente} className={classesBotao('secundario', 'mt-4')}>
          Tentar novamente
        </button>
      )}
    </div>
  )
}
