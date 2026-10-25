import type postgres from 'postgres'
import { comoUsuario } from './with-user'
import { cents } from '../domain/money'
import { conciliar, type DecisaoConciliacao } from '../domain/reconciliation'
import type { Cents, IsoDate } from '../domain/types'

export interface PreviaConciliacao {
  calculatedCents: Cents
  differenceCents: Cents
  confere: boolean
  decisoesPossiveis: DecisaoConciliacao[]
}

async function saldoCalculado(sql: postgres.TransactionSql, accountId: string): Promise<Cents> {
  const [linha] = await sql<{ balance_cents: string }[]>`
    select balance_cents from account_balances where account_id = ${accountId}
  `
  if (!linha) throw new Error('Conta não encontrada')
  return cents(Number(linha.balance_cents))
}

/** Só calcula e oferece. Nada é gravado até o usuário decidir (§5.3.1). */
export async function prepararConciliacao(
  userId: string,
  accountId: string,
  reportedCents: Cents,
): Promise<PreviaConciliacao> {
  const calculatedCents = await comoUsuario(userId, (sql) => saldoCalculado(sql, accountId))
  const resultado = conciliar(reportedCents, calculatedCents)

  return {
    calculatedCents,
    differenceCents: resultado.differenceCents,
    confere: resultado.confere,
    decisoesPossiveis: resultado.decisoesPossiveis,
  }
}

export interface RegistroConciliacao {
  accountId: string
  reportedCents: Cents
  decision: DecisaoConciliacao
  motivo?: string
  nota?: string
  quando: IsoDate
}

/**
 * Grava a decisão. Só `ajuste_criado` gera lançamento, e ele exige motivo:
 * um ajuste sem explicação é uma reescrita silenciosa do histórico, que é
 * exatamente o que o §5.3.1 proíbe.
 *
 * A conta só passa a conciliada quando o razão bate com o extrato: sem
 * diferença, ou com o ajuste criado. Nas outras decisões a diferença fica
 * registrada e o saldo continua estimado — marcar como conferido um saldo
 * que o banco desmente seria mentir (§6.1). Adiar não é esconder.
 *
 * O saldo calculado é lido na mesma transação da gravação, para que o
 * registro congele exatamente o valor comparado.
 */
export async function registrarConciliacao(
  userId: string,
  dados: RegistroConciliacao,
): Promise<{ reconciliationId: string; adjustmentTransactionId: string | null }> {
  if (dados.decision === 'ajuste_criado' && !dados.motivo?.trim()) {
    throw new Error('Ajuste de saldo exige motivo registrado')
  }

  return comoUsuario(userId, async (sql) => {
    const calculatedCents = await saldoCalculado(sql, dados.accountId)
    const { differenceCents, confere } = conciliar(dados.reportedCents, calculatedCents)

    let adjustmentTransactionId: string | null = null

    if (dados.decision === 'ajuste_criado' && differenceCents !== 0) {
      const [ajuste] = await sql<{ id: string }[]>`
        insert into transactions (
          user_id, account_id, kind, description, amount_cents, direction,
          status, competence_date, settled_date, adjustment_reason, source
        ) values (
          ${userId}, ${dados.accountId}, 'ajuste', 'Ajuste de conciliação',
          ${Math.abs(differenceCents)}, ${differenceCents > 0 ? 1 : -1},
          'liquidado', ${dados.quando}, ${dados.quando}, ${dados.motivo!}, 'manual'
        )
        returning id
      `
      adjustmentTransactionId = ajuste.id
    }

    const [registro] = await sql<{ id: string }[]>`
      insert into reconciliations (
        user_id, account_id, reported_balance_cents, calculated_balance_cents,
        decision, adjustment_transaction_id, note
      ) values (
        ${userId}, ${dados.accountId}, ${dados.reportedCents}, ${calculatedCents},
        ${dados.decision}, ${adjustmentTransactionId}, ${dados.nota ?? null}
      )
      returning id
    `

    if (confere || adjustmentTransactionId !== null) {
      await sql`
        update accounts set last_reconciled_at = now(), updated_at = now()
        where id = ${dados.accountId}
      `
    }

    return { reconciliationId: registro.id, adjustmentTransactionId }
  })
}
