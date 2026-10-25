import { createHash } from 'node:crypto'
import { comoUsuario } from './with-user'

export interface EventoAuditoria {
  eventType: string
  objectType?: string
  /** Identificador do objeto. É pseudonimizado antes de gravar. */
  objectId?: string
  source: 'usuario' | 'importacao' | 'integracao' | 'regra' | 'ia'
  result: 'sucesso' | 'falha'
  errorCode?: string
  correlationId?: string
}

/**
 * Pseudônimo estável: o mesmo identificador sempre vira a mesma referência,
 * o que permite correlacionar eventos sem que a trilha guarde a chave real.
 */
function pseudonimo(valor: string): string {
  return createHash('sha256').update(valor).digest('hex').slice(0, 16)
}

/**
 * Grava só o que o §11 permite: tipo, hora, ator, objeto, origem, resultado.
 * Não existe parâmetro para valor ou descrição, e a tabela não tem coluna
 * para eles — a omissão é estrutural, não disciplina.
 */
export async function registrarEvento(userId: string, evento: EventoAuditoria): Promise<void> {
  await comoUsuario(userId, (sql) => sql`
    insert into audit_events (
      user_id, event_type, actor_ref, object_type, object_ref,
      source, result, error_code, correlation_id
    ) values (
      ${userId}, ${evento.eventType}, ${pseudonimo(userId)},
      ${evento.objectType ?? null}, ${evento.objectId ? pseudonimo(evento.objectId) : null},
      ${evento.source}, ${evento.result}, ${evento.errorCode ?? null},
      ${evento.correlationId ?? null}
    )
  `)
}
