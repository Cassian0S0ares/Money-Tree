import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ItemLancamento } from '../../src/components/item-lancamento'
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
})
