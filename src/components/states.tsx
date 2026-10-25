/**
 * Os estados que o §13 exige em toda área de dados. Estão juntos num
 * arquivo porque mudam juntos: a linguagem de um precisa combinar com a dos
 * outros.
 */

export function Carregando({ rotulo = 'Carregando' }: { rotulo?: string }) {
  return (
    <div role="status" aria-live="polite" className="py-12 text-center text-sm text-slate-500">
      {rotulo}…
    </div>
  )
}

export function SemDados({ titulo, descricao, acao }: {
  titulo: string
  descricao: string
  acao?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 py-12 text-center">
      <p className="font-medium text-slate-900">{titulo}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">{descricao}</p>
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  )
}

export function SemResultados({ aoLimpar }: { aoLimpar?: () => void }) {
  return (
    <div className="py-12 text-center">
      <p className="text-sm text-slate-600">Nenhum lançamento encontrado com esses filtros.</p>
      {aoLimpar && (
        <button type="button" onClick={aoLimpar} className="mt-2 text-sm underline">
          Limpar filtros
        </button>
      )}
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
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">
      <p className="font-medium text-red-900">
        <span aria-hidden="true">⚠ </span>
        {oQueAconteceu}
      </p>
      <p className="mt-1 text-sm text-red-800">{oQueFoiPreservado}</p>
      <p className="mt-1 text-sm text-red-800">{comoCorrigir}</p>
      {aoTentarNovamente && (
        <button
          type="button"
          onClick={aoTentarNovamente}
          className="mt-3 rounded border border-red-300 bg-white px-3 py-1.5 text-sm"
        >
          Tentar novamente
        </button>
      )}
    </div>
  )
}
