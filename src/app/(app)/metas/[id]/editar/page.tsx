import Link from 'next/link'
import { notFound } from 'next/navigation'
import { listarContas } from '../../../../../data/accounts'
import { buscarMeta } from '../../../../../data/goals'
import { hojeEm, isoDate } from '../../../../../domain/dates'
import { cents } from '../../../../../domain/money'
import type { Cents } from '../../../../../domain/types'
import { exigirUsuario } from '../../../../../lib/session'
import { valorParaEntrada } from '../../../../../lib/format'
import { SemDados } from '../../../../../components/states'
import { CabecalhoPagina, LinkBotao } from '../../../../../components/ui'
import { FormularioMeta } from '../../formulario'

export const metadata = { title: 'Editar meta' }

/** Centavos vindos de uma opção de prazo; qualquer coisa fora disso é ignorada. */
function centavosDaUrl(valor: unknown): Cents | null {
  if (typeof valor !== 'string' || !/^\d{1,13}$/.test(valor)) return null
  const n = Number(valor)
  return n > 0 ? cents(n) : null
}

function dataDaUrl(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  try {
    return isoDate(valor)
  } catch {
    return null
  }
}

export default async function PaginaEditarMeta({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const query = await searchParams
  const usuario = await exigirUsuario()
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const encontrada = await buscarMeta(usuario.id, id, hojeEm(usuario.timezone), usuario.monthStartDay)
  if (!encontrada) notFound()
  const { meta } = encontrada

  if (meta.completedAt || meta.archivedAt) {
    return (
      <SemDados
        titulo="Esta meta está encerrada"
        descricao="Meta concluída ou arquivada não muda mais. Para um novo objetivo, crie outra meta."
        acao={<LinkBotao href={`/metas/${meta.id}`}>Voltar para a meta</LinkBotao>}
      />
    )
  }

  const contas = await listarContas(usuario.id)

  // Opções de prazo (spec 6.4) chegam pela URL e só preenchem o formulário.
  const alvo = centavosDaUrl(query.alvo)
  const contribuicao = centavosDaUrl(query.contribuicao)
  const data = dataDaUrl(query.data)
  const sugerido = alvo !== null || contribuicao !== null || data !== null

  return (
    <section>
      <Link href={`/metas/${meta.id}`} className="mb-4 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-marca-700 hover:underline">
        <span aria-hidden="true">←</span> Voltar para a meta
      </Link>
      <CabecalhoPagina titulo="Editar meta" />
      <FormularioMeta
        metaId={meta.id}
        sugerido={sugerido}
        contas={contas.map((c) => ({ id: c.id, name: c.name }))}
        padrao={{
          name: meta.name,
          kind: meta.kind,
          alvo: valorParaEntrada(alvo ?? meta.targetCents),
          data: data ?? meta.targetDate ?? '',
          priority: meta.priority,
          accountId: meta.accountId ?? '',
          contribuicao:
            contribuicao !== null
              ? valorParaEntrada(contribuicao)
              : meta.monthlyContributionCents !== null
                ? valorParaEntrada(meta.monthlyContributionCents)
                : '',
        }}
      />
    </section>
  )
}
