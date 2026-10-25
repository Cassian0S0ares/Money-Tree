import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, limparBanco, sqlAdmin } from './helpers'
import { registrarEvento } from '../../src/data/audit'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

describe('trilha de auditoria', () => {
  it('grava o evento sem expor o identificador real', async () => {
    const usuario = await criarUsuario()

    await registrarEvento(usuario, {
      eventType: 'conta.criada',
      objectType: 'account',
      objectId: 'conta-123',
      source: 'usuario',
      result: 'sucesso',
    })

    const [evento] = await sqlAdmin<{ actor_ref: string; object_ref: string }[]>`
      select actor_ref, object_ref from audit_events
    `

    expect(evento.actor_ref).not.toBe(usuario)
    expect(evento.actor_ref).toHaveLength(16)
    expect(evento.object_ref).not.toBe('conta-123')
  })

  it('o mesmo identificador gera sempre o mesmo pseudônimo', async () => {
    const usuario = await criarUsuario()

    await registrarEvento(usuario, { eventType: 'a', source: 'usuario', result: 'sucesso' })
    await registrarEvento(usuario, { eventType: 'b', source: 'usuario', result: 'sucesso' })

    const eventos = await sqlAdmin<{ actor_ref: string }[]>`select actor_ref from audit_events`
    expect(eventos[0].actor_ref).toBe(eventos[1].actor_ref)
  })

  it('AMEAÇA T7: a aplicação não consegue alterar nem apagar a trilha', async () => {
    const usuario = await criarUsuario()
    await registrarEvento(usuario, { eventType: 'x', source: 'usuario', result: 'sucesso' })

    await expect(
      sqlAdmin.begin(async (tx) => {
        await tx`set local role money_tree_app`
        await tx`select set_config('app.user_id', ${usuario}, true)`
        return tx`delete from audit_events`
      }),
    ).rejects.toThrow(/permission denied/i)
  })
})
