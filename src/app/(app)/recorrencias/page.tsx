import Link from 'next/link'
import { listarRegras, type RegraComProxima } from '../../../data/recurrences'
import { listarContas } from '../../../data/accounts'
import { descreverRegra } from '../../../domain/recurrence'
import { hojeEm } from '../../../domain/dates'
import { exigirUsuario } from '../../../lib/session'
import { dataLonga } from '../../../lib/format'
import { SemDados } from '../../../components/states'
import { CabecalhoPagina, Cartao, LinkBotao, Valor } from '../../../components/ui'

export const metadata = { title: 'Recorrências' }

const GRUPOS = [
  { estado: 'ativa', titulo: 'Ativas' },
  { estado: 'pausada', titulo: 'Pausadas' },
  { estado: 'encerrada', titulo: 'Encerradas' },
] as const

/**
 * Regra ativa cujo fim por data já passou terminou de fato: depois de um
 * "desta em diante", a antiga fica assim. Para quem lê, é encerrada.
 */
function estadoVisivel(regra: RegraComProxima, hoje: string) {
  return regra.status === 'ativa' && regra.endDate !== null && regra.endDate < hoje ? 'encerrada' : regra.status
}

function Linha({ regra, nomeConta }: { regra: RegraComProxima; nomeConta: Map<string, string> }) {
  return (
    <Link
      href={`/recorrencias/${regra.id}`}
      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
    >
      <span className="min-w-0">
        <span className="block truncate font-medium text-slate-900">{regra.description}</span>
        <span className="block truncate text-xs text-slate-600">
          {descreverRegra(regra)} · {nomeConta.get(regra.accountId) ?? 'Conta'}
          {regra.kind === 'transferencia' && ` → ${nomeConta.get(regra.toAccountId ?? '') ?? 'Conta'}`}
        </span>
        {regra.status === 'ativa' && regra.proximoVencimento && (
          <span className="block text-xs text-slate-600">
            Próxima: <time dateTime={regra.proximoVencimento}>{dataLonga(regra.proximoVencimento)}</time>
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1 font-medium">
        {regra.amountIsEstimate && (
          <>
            <span aria-hidden="true" className="text-xs text-amber-800">≈</span>
            <span className="sr-only">cerca de</span>
          </>
        )}
        <Valor
          centavos={regra.amountCents}
          direcao={regra.kind === 'transferencia' ? undefined : regra.kind === 'receita' ? 1 : -1}
        />
      </span>
    </Link>
  )
}

export default async function PaginaRecorrencias() {
  const usuario = await exigirUsuario()
  const [regras, contas] = await Promise.all([
    listarRegras(usuario.id, hojeEm(usuario.timezone)),

    listarContas(usuario.id, { incluirArquivadas: true }),
  ])
  const nomeConta = new Map(contas.map((conta) => [conta.id, conta.name]))
  const hoje = hojeEm(usuario.timezone)

  return (
    <section className="space-y-8">
      <CabecalhoPagina
        titulo="Recorrências"
        descricao="O que se repete: aluguel, salário, assinaturas, reservas. As ocorrências aparecem como previstas até 90 dias à frente."
        acao={<LinkBotao href="/recorrencias/nova">Nova recorrência</LinkBotao>}
      />

      {regras.length === 0 ? (
        <SemDados
          titulo="Nenhuma recorrência ainda"
          descricao="Cadastre o que se repete e o Money Tree passa a mostrar o que vence antes de vencer."
          acao={<LinkBotao href="/recorrencias/nova">Cadastrar a primeira</LinkBotao>}
        />
      ) : (
        GRUPOS.map(({ estado, titulo }) => {
          const doGrupo = regras.filter((regra) => estadoVisivel(regra, hoje) === estado)
          if (doGrupo.length === 0) return null
          return (
            <section key={estado} aria-labelledby={`grupo-${estado}`}>
              <h2 id={`grupo-${estado}`} className="mb-3 text-lg font-semibold text-slate-900">
                {titulo} <span className="text-sm font-normal text-slate-500">({doGrupo.length})</span>
              </h2>
              <Cartao>
                <ul className="divide-y divide-slate-100">
                  {doGrupo.map((regra) => (
                    <li key={regra.id}>
                      <Linha regra={regra} nomeConta={nomeConta} />
                    </li>
                  ))}
                </ul>
              </Cartao>
            </section>
          )
        })
      )}
    </section>
  )
}
