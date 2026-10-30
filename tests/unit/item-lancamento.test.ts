import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ItemLancamento } from '../../src/components/item-lancamento'
import { MetasResumo } from '../../src/components/metas-resumo'
import type { MetaAvaliada } from '../../src/data/goals'
import { avaliarMeta } from '../../src/domain/goal'
import type { Lancamento } from '../../src/data/transactions'
import { isoDate } from '../../src/domain/dates'
import { cents } from '../../src/domain/money'

const CARGA = '<img src=x onerror="alert(1)"><script>alert(2)</script>'

function lancamento(descricao: string): Lancamento {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    accountId: 'a',
    categoryId: null,
    kind: 'despesa',
    nature: 'variavel',
    description: descricao,
    counterparty: null,
    notes: null,
    amountCents: cents(1000),
    direction: -1,
    signedAmountCents: cents(-1000),
    status: 'liquidado',
    competenceDate: isoDate('2026-10-20'),
    settledDate: isoDate('2026-10-20'),
    transferGroupId: null,
    adjustmentReason: null,
    source: 'manual',
    createdAt: new Date(),
    dueDate: null,
    recurrenceRuleId: null,
    occurrenceDate: null,
    isException: false,
  }
}

describe('AMEAÇA T5: XSS em texto do usuário', () => {
  it('descrição, conta e categoria maliciosas saem como texto, não como HTML', () => {
    const html = renderToStaticMarkup(
      createElement(ItemLancamento, {
        item: lancamento(CARGA),
        nomeConta: CARGA,
        nomeCategoria: CARGA,
        atrasado: false,
      }),
    )

    // Nenhuma tag nova nasce da carga: ela aparece escapada.
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    // "onerror=" pode aparecer como texto escapado; dentro de uma tag, não.
    expect(html).not.toMatch(/<[^>]*\sonerror=/)
    expect(html).toContain('&lt;script&gt;alert(2)&lt;/script&gt;')
  })

  it('nome de meta e de conta maliciosos saem como texto, também no aria-label', () => {
    const alvo = cents(100_000)
    const reservado = cents(150_000)
    const meta: MetaAvaliada = {
      id: '00000000-0000-0000-0000-000000000002',
      name: CARGA,
      kind: 'viagem',
      targetCents: alvo,
      targetDate: null,
      priority: 'alta',
      accountId: null,
      monthlyContributionCents: null,
      completedAt: null,
      archivedAt: null,
      reservado,
      // Reserva acima do saldo, para o nome da conta aparecer no aviso.
      reservasPorConta: [{ accountId: 'a', accountName: CARGA, reservado, acimaDoSaldo: cents(500) }],
      avaliacao: avaliarMeta({
        alvo, reservado, dataAlvo: null, planejado: null, movimentos: [],
        hoje: isoDate('2026-10-20'), diaInicio: 1,
      }),
    }
    const html = renderToStaticMarkup(createElement(MetasResumo, { ativas: [meta] }))

    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    // Aqui a carga também vai para um atributo (aria-label da barra), então
    // "onerror=" aparece dentro de uma tag, mas como valor entre aspas: o que
    // não pode existir é o atributo de verdade, seguido de aspas cruas.
    expect(html).not.toMatch(/\sonerror="/)
    // No texto do link, no aviso da conta e no atributo da barra.
    expect(html.split('&lt;script&gt;alert(2)&lt;/script&gt;').length - 1).toBe(3)
    // No atributo, com as aspas escapadas: a carga não fecha o valor.
    expect(html).toContain('aria-label="Reservado para &lt;img src=x onerror=&quot;alert(1)&quot;&gt;')
  })
})
