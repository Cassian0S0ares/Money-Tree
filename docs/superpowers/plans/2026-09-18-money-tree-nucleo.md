# Money Tree — Fatia 1 (Núcleo): Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o núcleo utilizável do Money Tree — entrar no sistema, cadastrar contas, registrar os quatro tipos de lançamento, categorizar, conciliar saldo e ver quanto se tem em cada conta e no total.

**Architecture:** Três camadas com dependência apontando só para dentro. `src/domain/` é TypeScript puro sem I/O, onde vive toda a regra financeira e onde os testes rodam em milissegundos. `src/data/` é o único lugar com SQL. `src/app/` é Next.js, que orquestra e nunca calcula. O Postgres carrega os invariantes que não podem depender do código da aplicação: constraints, gatilhos e RLS forçada.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind v4, `postgres` (postgres.js), `node-pg-migrate` com migrações em SQL, Zod, `@node-rs/argon2`, Vitest, fast-check, Docker Postgres 17 para testes de integração.

**Spec:** `docs/superpowers/specs/2026-09-18-money-tree-nucleo-design.md`
**Contrato de produto:** `PRODUCT.md` v0.2
**Modelo de ameaças:** `docs/seguranca/modelo-de-ameacas.md`

## Global Constraints

Estas regras valem para **todas** as tarefas. Não são repetidas em cada uma.

- **Dinheiro é `bigint` de centavos no banco e `Cents` (inteiro marcado) no TypeScript.** Ponto flutuante binário é proibido em qualquer cálculo financeiro. (§12)
- **Datas financeiras são `date`** e preservam a data civil. **Horários técnicos são `timestamptz` em UTC.** (§12)
- **Toda tabela tem `user_id uuid`**, RLS ligada com `FORCE ROW LEVEL SECURITY`, policy comparando com `current_setting('app.user_id', true)::uuid`.
- **A aplicação conecta como `money_tree_app`**, nunca como `postgres.<ref>`. O superusuário ignora RLS.
- **Runtime na porta 6543** (pooler em modo transação, exige `prepare: false`). **Migrações na porta 5432** (modo sessão).
- **Nenhum segredo no repositório.** `.env.local` está no `.gitignore` desde o commit inicial. `.env.example` só tem placeholders.
- **Nenhum valor, descrição, estabelecimento, token ou credencial em log ou em `audit_events`.** (§11)
- **`src/domain/` não importa `postgres`, `pg`, `react`, `next` nem nada com I/O.** Regra de lint, não convenção.
- **Texto vindo do usuário ou de importação é não confiável**, escapado em toda renderização e tratado como não confiável novamente ao ser lido do banco. (§5.3)
- **Interface em `pt-BR`**: datas, moeda e números formatados com `Intl`. Estado nunca comunicado só por cor. Nunca `alert`, `confirm` ou `prompt`. (§14)
- **Teste antes do código.** Toda tarefa começa por um teste que falha.
- **Commit ao fim de cada tarefa**, com a mensagem indicada.

---

## Estrutura de arquivos

```
money-tree/
├─ .env.example                        placeholders, sem segredo
├─ docker-compose.test.yml             Postgres 17 descartável para integração
├─ eslint.config.mjs                   inclui a regra de fronteira do domínio
├─ vitest.config.ts                    dois projetos: unit e integration
├─ migrations/
│  ├─ 001_base.sql                     extensões, role da app, users, sessions
│  ├─ 002_accounts_categories.sql      contas, categorias, seed
│  ├─ 003_transactions.sql             razão, constraints, gatilho, estornos
│  └─ 004_reconciliation_audit.sql     conciliação, auditoria, view, transferência
├─ scripts/
│  ├─ migrate.ts                       runner; exige porta de sessão
│  ├─ backup.sh                        pg_dump cifrado
│  └─ restore-test.sh                  prova que o backup restaura
├─ src/
│  ├─ domain/                          TS puro, sem I/O
│  │  ├─ types.ts                      uniões e tipos compartilhados
│  │  ├─ money.ts                      Cents, parse e formato pt-BR, rateio
│  │  ├─ dates.ts                      competência, liquidação, fuso, mês financeiro
│  │  ├─ transaction.ts                máquina de estados e invariantes
│  │  ├─ balance.ts                    saldo calculado e is_estimated
│  │  └─ reconciliation.ts             diferença e decisões
│  ├─ data/                            único lugar com SQL
│  │  ├─ db.ts                         cliente postgres.js
│  │  ├─ with-user.ts                  transação + SET LOCAL app.user_id
│  │  ├─ users.ts  sessions.ts  audit.ts
│  │  ├─ accounts.ts  categories.ts  transactions.ts  reconciliations.ts
│  ├─ lib/
│  │  ├─ logger.ts                     logger com redação
│  │  ├─ format.ts                     Intl pt-BR para a interface
│  │  └─ session.ts                    cookie, leitura e rotação
│  ├─ components/
│  │  ├─ dialog.tsx                    diálogo acessível, substitui confirm()
│  │  ├─ toast.tsx                     aviso com desfazer
│  │  ├─ status-badge.tsx              ícone + texto, nunca só cor
│  │  └─ states.tsx                    carregando, vazio, erro, offline
│  └─ app/
│     ├─ layout.tsx  page.tsx          casca e tela de saldos
│     ├─ entrar/                       login
│     ├─ contas/                       lista, nova, [id], [id]/conciliar
│     ├─ lancamentos/                  lista, novo, [id]
│     ├─ categorias/                   árvore
│     └─ configuracoes/
└─ tests/
   ├─ unit/                            espelha src/domain/
   └─ integration/                     exige Docker Postgres
```

---

## Ordem das tarefas

Domínio primeiro (tarefas 2–6), porque é puro e não depende de nada. Banco depois (7–11), porque carrega os invariantes. Dados e autenticação (12–17). Interface por último (18–24), porque consome tudo que veio antes.

---

### Task 1: Esqueleto do projeto e a fronteira do domínio

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `.env.example`, `docker-compose.test.yml`
- Create: `src/domain/types.ts`
- Test: `tests/unit/boundary.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `src/domain/types.ts` exporta `Cents`, `TransactionKind`, `TransactionStatus`, `TransactionNature`, `AccountType`, `CategoryKind`, `TransactionSource`, `IsoDate`. Scripts `npm test`, `npm run test:integration`, `npm run lint`.

A regra de lint que impede o domínio de importar I/O não é burocracia: é o que mantém os testes financeiros rodando em milissegundos. Se ela cair, o domínio apodrece em silêncio.

- [ ] **Step 1: Criar o projeto Next.js**

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --no-import-alias --use-npm
```

Responda `No` para Turbopack se perguntado. O projeto já tem `.gitignore` e `PRODUCT.md`; aceite sobrescrever apenas `.gitignore` **não** — mantenha o existente e confira depois que `.env.local` continua listado.

- [ ] **Step 2: Instalar as dependências restantes**

```bash
npm install postgres zod @node-rs/argon2
npm install -D vitest @vitest/coverage-v8 fast-check node-pg-migrate tsx eslint-plugin-boundaries
```

- [ ] **Step 3: Escrever o teste da fronteira do domínio**

`tests/unit/boundary.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const PROIBIDOS = ['postgres', 'pg', 'react', 'next', 'node:fs', 'node:net']
const DOMINIO = join(process.cwd(), 'src/domain')

describe('fronteira do domínio', () => {
  it('nenhum arquivo de domínio importa I/O', () => {
    const arquivos = readdirSync(DOMINIO).filter((f) => f.endsWith('.ts'))
    expect(arquivos.length).toBeGreaterThan(0)

    const violacoes: string[] = []
    for (const arquivo of arquivos) {
      const conteudo = readFileSync(join(DOMINIO, arquivo), 'utf8')
      for (const proibido of PROIBIDOS) {
        if (new RegExp(`from\\s+['"]${proibido}(/|['"])`).test(conteudo)) {
          violacoes.push(`${arquivo} importa ${proibido}`)
        }
      }
    }
    expect(violacoes).toEqual([])
  })
})
```

- [ ] **Step 4: Rodar o teste e ver falhar**

Run: `npx vitest run tests/unit/boundary.test.ts`
Expected: FAIL — `src/domain` não existe ainda (`ENOENT`).

- [ ] **Step 5: Criar `src/domain/types.ts`**

```ts
/** Centavos inteiros. Nunca ponto flutuante. Ver PRODUCT.md §12. */
export type Cents = number & { readonly __cents: unique symbol }

/** Data civil no formato AAAA-MM-DD. */
export type IsoDate = string & { readonly __isoDate: unique symbol }

export type TransactionKind = 'receita' | 'despesa' | 'transferencia' | 'ajuste'

/**
 * Os seis estados gravados. `atrasado` não está aqui de propósito:
 * é derivado de vencimento e liquidação. Ver a spec, seção 5.5.
 */
export type TransactionStatus =
  | 'previsto'
  | 'pendente'
  | 'liquidado'
  | 'conciliado'
  | 'cancelado'
  | 'estornado'

export type TransactionNature = 'fixa' | 'variavel'

export type TransactionSource = 'manual' | 'importacao' | 'integracao' | 'ia'

export type AccountType =
  | 'corrente'
  | 'pagamento'
  | 'poupanca'
  | 'carteira'
  | 'cartao_credito'
  | 'investimento'
  | 'emprestimo'
  | 'outro'

export type CategoryKind = 'receita' | 'despesa'
```

- [ ] **Step 6: Configurar o Vitest com dois projetos**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          hookTimeout: 30_000,
        },
      },
    ],
  },
})
```

Em `package.json`, adicione aos `scripts`:

```json
"test": "vitest run --project unit",
"test:watch": "vitest --project unit",
"test:integration": "vitest run --project integration",
"migrate": "tsx scripts/migrate.ts"
```

- [ ] **Step 7: Rodar o teste e ver passar**

Run: `npm test`
Expected: PASS — 1 teste.

- [ ] **Step 8: Criar `.env.example`**

Só placeholders. Se um valor real entrar aqui, ele vai para o Git.

```bash
# Runtime: pooler em modo transação. Exige prepare: false.
DATABASE_URL=postgresql://money_tree_app:SENHA@HOST.pooler.supabase.com:6543/postgres

# Migrações: pooler em modo sessão. Migração na 6543 quebra.
MIGRATION_DATABASE_URL=postgresql://USUARIO_DONO:SENHA@HOST.pooler.supabase.com:5432/postgres

# Testes de integração: Postgres local em Docker. Nunca o Supabase.
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/money_tree_test

# Sessão
SESSION_COOKIE_NAME=mt_session
SESSION_TTL_MINUTES=43200
SESSION_IDLE_LOCK_MINUTES=15
```

- [ ] **Step 9: Criar `docker-compose.test.yml`**

Porta 55432 para não colidir com um Postgres já instalado na máquina.

```yaml
services:
  postgres-test:
    image: postgres:17
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: money_tree_test
    ports:
      - '55432:5432'
    tmpfs:
      - /var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 2s
      timeout: 3s
      retries: 20
```

`tmpfs` deixa o banco em memória: rápido e sem deixar resíduo em disco.

- [ ] **Step 10: Confirmar que o `.gitignore` protege o `.env.local`**

Run: `git check-ignore -v .env.local`
Expected: imprime a linha do `.gitignore` que casa. Se não imprimir nada, **pare** e corrija o `.gitignore` antes de continuar.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: esqueleto Next.js, Vitest e fronteira do domínio

A regra de fronteira é testada, não confiada: tests/unit/boundary.test.ts
falha se algum arquivo de src/domain importar I/O."
```

---

### Task 2: `domain/money.ts` — centavos, pt-BR e rateio

**Files:**
- Create: `src/domain/money.ts`
- Test: `tests/unit/money.test.ts`

**Interfaces:**
- Consumes: `Cents` de `src/domain/types.ts`.
- Produces:
  - `cents(valor: number): Cents` — lança se não for inteiro finito.
  - `parseBRL(entrada: string): Cents` — lança `ValorInvalidoError` em entrada inválida.
  - `formatBRL(valor: Cents): string`
  - `addCents(a: Cents, b: Cents): Cents`
  - `subCents(a: Cents, b: Cents): Cents`
  - `negate(a: Cents): Cents`
  - `sumCents(valores: Cents[]): Cents`
  - `rateio(total: Cents, partes: number): Cents[]`
  - `class ValorInvalidoError extends Error`

`rateio` existe para divisão de lançamento, que é fatia futura, mas o algoritmo pertence a este módulo e a invariante "a soma das partes é exatamente o total" é uma das quatro que o §16 cobra. Implementar agora custa pouco e trava o comportamento.

- [ ] **Step 1: Escrever os testes que falham**

`tests/unit/money.test.ts`:

```ts
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  ValorInvalidoError,
  addCents,
  cents,
  formatBRL,
  parseBRL,
  rateio,
  subCents,
  sumCents,
} from '../../src/domain/money'

describe('cents', () => {
  it('aceita inteiro', () => {
    expect(cents(123456)).toBe(123456)
  })

  it('rejeita fracionário, porque centavo quebrado é bug financeiro', () => {
    expect(() => cents(10.5)).toThrow(ValorInvalidoError)
  })

  it('rejeita NaN e Infinity', () => {
    expect(() => cents(Number.NaN)).toThrow(ValorInvalidoError)
    expect(() => cents(Number.POSITIVE_INFINITY)).toThrow(ValorInvalidoError)
  })
})

describe('parseBRL', () => {
  it.each([
    ['1.234,56', 123456],
    ['1234,56', 123456],
    ['0,05', 5],
    ['1.000.000,00', 100000000],
    ['R$ 1.234,56', 123456],
    ['10', 1000],
    ['10,5', 1050],
  ])('converte %s em %i centavos', (entrada, esperado) => {
    expect(parseBRL(entrada)).toBe(esperado)
  })

  it('rejeita entrada vazia ou sem número', () => {
    expect(() => parseBRL('')).toThrow(ValorInvalidoError)
    expect(() => parseBRL('abc')).toThrow(ValorInvalidoError)
  })

  it('rejeita mais de duas casas decimais em vez de arredondar em silêncio', () => {
    expect(() => parseBRL('10,555')).toThrow(ValorInvalidoError)
  })
})

describe('formatBRL', () => {
  it('formata em pt-BR', () => {
    //   é o espaço não separável que o Intl usa após "R$".
    expect(formatBRL(cents(123456))).toBe('R$ 1.234,56')
    expect(formatBRL(cents(-500))).toBe('-R$ 5,00')
    expect(formatBRL(cents(0))).toBe('R$ 0,00')
  })
})

describe('aritmética', () => {
  it('soma e subtrai', () => {
    expect(addCents(cents(100), cents(250))).toBe(350)
    expect(subCents(cents(100), cents(250))).toBe(-150)
    expect(sumCents([cents(1), cents(2), cents(3)])).toBe(6)
    expect(sumCents([])).toBe(0)
  })
})

describe('rateio', () => {
  it('distribui o resto em vez de perdê-lo', () => {
    expect(rateio(cents(100), 3)).toEqual([34, 33, 33])
  })

  it('funciona com valor negativo', () => {
    expect(rateio(cents(-100), 3)).toEqual([-34, -33, -33])
  })

  it('rejeita número de partes inválido', () => {
    expect(() => rateio(cents(100), 0)).toThrow(ValorInvalidoError)
  })

  it('INVARIANTE: a soma das partes é sempre o total', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100_000_000, max: 100_000_000 }),
        fc.integer({ min: 1, max: 500 }),
        (total, partes) => {
          const fatias = rateio(cents(total), partes)
          expect(fatias).toHaveLength(partes)
          expect(fatias.reduce((a, b) => a + b, 0)).toBe(total)
        },
      ),
    )
  })

  it('INVARIANTE: duas fatias nunca diferem em mais de um centavo', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.integer({ min: 1, max: 500 }),
        (total, partes) => {
          const fatias = rateio(cents(total), partes)
          expect(Math.max(...fatias) - Math.min(...fatias)).toBeLessThanOrEqual(1)
        },
      ),
    )
  })
})

describe('ida e volta', () => {
  it('INVARIANTE: formatar e reinterpretar devolve o mesmo valor', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }), (valor) => {
        expect(parseBRL(formatBRL(cents(valor)))).toBe(valor)
      }),
    )
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- money`
Expected: FAIL — `Failed to resolve import "../../src/domain/money"`.

- [ ] **Step 3: Implementar `src/domain/money.ts`**

```ts
import type { Cents } from './types'

export class ValorInvalidoError extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ValorInvalidoError'
  }
}

/** Marca um inteiro como Cents. Lança se não for inteiro finito. */
export function cents(valor: number): Cents {
  if (!Number.isFinite(valor) || !Number.isInteger(valor)) {
    throw new ValorInvalidoError(`Valor precisa ser inteiro de centavos, recebido: ${valor}`)
  }
  return valor as Cents
}

const FORMATADOR = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export function formatBRL(valor: Cents): string {
  return FORMATADOR.format(valor / 100)
}

/**
 * Interpreta entrada pt-BR. Aceita separador de milhar, símbolo da moeda e
 * espaço não separável. Rejeita mais de duas casas decimais: arredondar em
 * silêncio é como centavo some.
 */
export function parseBRL(entrada: string): Cents {
  const limpo = entrada
    .replace(/[R$\s ]/g, '')
    .replace(/\./g, '')
    .trim()

  if (limpo === '' || !/^-?\d+(,\d{1,2})?$/.test(limpo)) {
    throw new ValorInvalidoError(`Valor monetário inválido: "${entrada}"`)
  }

  const negativo = limpo.startsWith('-')
  const [inteiros, decimais = ''] = limpo.replace('-', '').split(',')
  const centavos = Number(inteiros) * 100 + Number(decimais.padEnd(2, '0'))

  return cents(negativo ? -centavos : centavos)
}

export function addCents(a: Cents, b: Cents): Cents {
  return cents(a + b)
}

export function subCents(a: Cents, b: Cents): Cents {
  return cents(a - b)
}

export function negate(a: Cents): Cents {
  return cents(-a)
}

export function sumCents(valores: Cents[]): Cents {
  return cents(valores.reduce<number>((total, valor) => total + valor, 0))
}

/**
 * Divide um total em N partes sem perder nem inventar centavo.
 * O resto da divisão é distribuído uma unidade por vez, começando pela
 * primeira parte. A soma das partes é sempre exatamente o total.
 */
export function rateio(total: Cents, partes: number): Cents[] {
  if (!Number.isInteger(partes) || partes < 1) {
    throw new ValorInvalidoError(`Número de partes precisa ser inteiro positivo, recebido: ${partes}`)
  }

  const sinal = total < 0 ? -1 : 1
  const absoluto = Math.abs(total)
  const base = Math.floor(absoluto / partes)
  const resto = absoluto - base * partes

  return Array.from({ length: partes }, (_, indice) =>
    cents(sinal * (base + (indice < resto ? 1 : 0))),
  )
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- money`
Expected: PASS — todos, inclusive as três propriedades.

Se a ida e volta falhar, quase sempre é o espaço não separável (` `) que o `Intl` insere depois de `R$`. O `parseBRL` já o remove; confirme que o teste também o usa.

- [ ] **Step 5: Commit**

```bash
git add src/domain/money.ts tests/unit/money.test.ts
git commit -m "feat(domain): centavos, parse e formato pt-BR, rateio sem perda

Rateio distribui o resto em vez de descartá-lo. Três testes de
propriedade travam as invariantes: soma exata, diferença máxima de um
centavo entre fatias, e ida e volta de formato."
```

---

### Task 3: `domain/dates.ts` — competência, liquidação e mês financeiro

**Files:**
- Create: `src/domain/dates.ts`
- Test: `tests/unit/dates.test.ts`

**Interfaces:**
- Consumes: `IsoDate` de `src/domain/types.ts`.
- Produces:
  - `isoDate(texto: string): IsoDate` — valida `AAAA-MM-DD`, lança `DataInvalidaError`.
  - `hojeEm(timezone: string, agora?: Date): IsoDate`
  - `comparaDatas(a: IsoDate, b: IsoDate): number`
  - `mesFinanceiro(referencia: IsoDate, diaInicio: number): { inicio: IsoDate; fim: IsoDate }`
  - `class DataInvalidaError extends Error`

O §12 exige data civil preservada e hora técnica em UTC. Guardar `Date` do JavaScript para data financeira introduz fuso onde não devia haver nenhum: 1º de março em São Paulo vira 28 de fevereiro em UTC, e o lançamento muda de mês. Por isso `IsoDate` é uma string validada, não um `Date`.

- [ ] **Step 1: Escrever os testes que falham**

`tests/unit/dates.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  DataInvalidaError,
  comparaDatas,
  hojeEm,
  isoDate,
  mesFinanceiro,
} from '../../src/domain/dates'

describe('isoDate', () => {
  it('aceita AAAA-MM-DD', () => {
    expect(isoDate('2026-09-18')).toBe('2026-09-18')
  })

  it.each(['18/09/2026', '2026-9-8', '2026-13-01', '2026-02-30', ''])(
    'rejeita %s',
    (entrada) => {
      expect(() => isoDate(entrada)).toThrow(DataInvalidaError)
    },
  )
})

describe('hojeEm', () => {
  it('usa o fuso do usuário, não o do servidor', () => {
    // 2026-09-19T02:00:00Z ainda é 18 de setembro em São Paulo (UTC-3).
    const instante = new Date('2026-09-19T02:00:00Z')
    expect(hojeEm('America/Sao_Paulo', instante)).toBe('2026-09-18')
    expect(hojeEm('UTC', instante)).toBe('2026-09-19')
  })
})

describe('comparaDatas', () => {
  it('ordena cronologicamente', () => {
    expect(comparaDatas(isoDate('2026-01-01'), isoDate('2026-02-01'))).toBeLessThan(0)
    expect(comparaDatas(isoDate('2026-02-01'), isoDate('2026-01-01'))).toBeGreaterThan(0)
    expect(comparaDatas(isoDate('2026-01-01'), isoDate('2026-01-01'))).toBe(0)
  })
})

describe('mesFinanceiro', () => {
  it('com início no dia 1, é o mês civil', () => {
    expect(mesFinanceiro(isoDate('2026-09-18'), 1)).toEqual({
      inicio: '2026-09-01',
      fim: '2026-09-30',
    })
  })

  it('com início no dia 5, o período atravessa a virada do mês', () => {
    expect(mesFinanceiro(isoDate('2026-09-18'), 5)).toEqual({
      inicio: '2026-09-05',
      fim: '2026-10-04',
    })
  })

  it('antes do dia de início, o período é o anterior', () => {
    expect(mesFinanceiro(isoDate('2026-09-03'), 5)).toEqual({
      inicio: '2026-08-05',
      fim: '2026-09-04',
    })
  })

  it('início no dia 31 cai no último dia dos meses curtos', () => {
    expect(mesFinanceiro(isoDate('2026-03-15'), 31)).toEqual({
      inicio: '2026-02-28',
      fim: '2026-03-30',
    })
  })

  it('rejeita dia de início fora de 1..31', () => {
    expect(() => mesFinanceiro(isoDate('2026-09-18'), 0)).toThrow(DataInvalidaError)
    expect(() => mesFinanceiro(isoDate('2026-09-18'), 32)).toThrow(DataInvalidaError)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- dates`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar `src/domain/dates.ts`**

```ts
import type { IsoDate } from './types'

export class DataInvalidaError extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'DataInvalidaError'
  }
}

const PADRAO = /^(\d{4})-(\d{2})-(\d{2})$/

/** Valida AAAA-MM-DD e confirma que a data existe de verdade. */
export function isoDate(texto: string): IsoDate {
  const casou = PADRAO.exec(texto)
  if (!casou) {
    throw new DataInvalidaError(`Data precisa estar em AAAA-MM-DD, recebido: "${texto}"`)
  }

  const [, ano, mes, dia] = casou
  const data = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)))

  const existe =
    data.getUTCFullYear() === Number(ano) &&
    data.getUTCMonth() === Number(mes) - 1 &&
    data.getUTCDate() === Number(dia)

  if (!existe) {
    throw new DataInvalidaError(`Data inexistente: "${texto}"`)
  }

  return texto as IsoDate
}

/**
 * A data civil de hoje no fuso do usuário. O servidor pode estar em qualquer
 * lugar; a data financeira é a que o usuário vê no calendário dele.
 */
export function hojeEm(timezone: string, agora: Date = new Date()): IsoDate {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora)

  return isoDate(partes)
}

/** Ordem cronológica. AAAA-MM-DD ordena corretamente como texto. */
export function comparaDatas(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function paraUTC(data: IsoDate): Date {
  const [ano, mes, dia] = data.split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1, dia))
}

function paraIso(data: Date): IsoDate {
  return isoDate(data.toISOString().slice(0, 10))
}

function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate()
}

/** Início do período que contém `referencia`, dado o dia de virada. */
function inicioDoPeriodo(ano: number, mes: number, diaInicio: number): Date {
  const dia = Math.min(diaInicio, ultimoDiaDoMes(ano, mes))
  return new Date(Date.UTC(ano, mes, dia))
}

/**
 * O mês financeiro do usuário, que não precisa começar no dia 1.
 * Com diaInicio = 5, o período de setembro vai de 05/09 a 04/10.
 * Se o mês não tiver o dia de início — dia 31 em fevereiro — usa o último dia.
 */
export function mesFinanceiro(
  referencia: IsoDate,
  diaInicio: number,
): { inicio: IsoDate; fim: IsoDate } {
  if (!Number.isInteger(diaInicio) || diaInicio < 1 || diaInicio > 31) {
    throw new DataInvalidaError(`Dia de início precisa estar entre 1 e 31, recebido: ${diaInicio}`)
  }

  const ref = paraUTC(referencia)
  const ano = ref.getUTCFullYear()
  const mes = ref.getUTCMonth()

  let inicio = inicioDoPeriodo(ano, mes, diaInicio)
  if (ref < inicio) {
    inicio = inicioDoPeriodo(ano, mes - 1, diaInicio)
  }

  const proximo = inicioDoPeriodo(
    inicio.getUTCFullYear(),
    inicio.getUTCMonth() + 1,
    diaInicio,
  )
  const fim = new Date(proximo.getTime() - 86_400_000)

  return { inicio: paraIso(inicio), fim: paraIso(fim) }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- dates`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/dates.ts tests/unit/dates.test.ts
git commit -m "feat(domain): data civil, fuso do usuário e mês financeiro

IsoDate é string validada, não Date: guardar data financeira como Date
faz 1º de março em São Paulo virar 28 de fevereiro em UTC e o lançamento
mudar de mês."
```

---

### Task 4: `domain/transaction.ts` — máquina de estados e invariantes

**Files:**
- Create: `src/domain/transaction.ts`
- Test: `tests/unit/transaction.test.ts`

**Interfaces:**
- Consumes: `TransactionKind`, `TransactionStatus`, `TransactionNature`, `Cents`, `IsoDate` de `types.ts`; `comparaDatas` de `dates.ts`; `cents` de `money.ts`.
- Produces:
  - `STATUS_INICIAIS: readonly TransactionStatus[]`
  - `MOVEM_SALDO: readonly TransactionStatus[]` — `['liquidado', 'conciliado']`
  - `podeTransicionar(de: TransactionStatus, para: TransactionStatus): boolean`
  - `assertTransicao(de: TransactionStatus, para: TransactionStatus): void`
  - `direcaoPara(kind: TransactionKind, explicita?: -1 | 1): -1 | 1`
  - `interface LancamentoValidavel`
  - `validarLancamento(lancamento: LancamentoValidavel): void`
  - `estaAtrasado(lancamento: { competenceDate: IsoDate; status: TransactionStatus }, hoje: IsoDate): boolean`
  - `class LancamentoInvalidoError extends Error`

`MOVEM_SALDO` é exportado daqui e consumido por `balance.ts`, pelos repositórios e pela migração. Um único lugar decide o que conta para saldo.

- [ ] **Step 1: Escrever os testes que falham**

`tests/unit/transaction.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isoDate } from '../../src/domain/dates'
import { cents } from '../../src/domain/money'
import {
  LancamentoInvalidoError,
  MOVEM_SALDO,
  STATUS_INICIAIS,
  assertTransicao,
  direcaoPara,
  estaAtrasado,
  podeTransicionar,
  validarLancamento,
} from '../../src/domain/transaction'

describe('estados iniciais', () => {
  it('lançamento pode nascer liquidado', () => {
    expect(STATUS_INICIAIS).toEqual(['previsto', 'pendente', 'liquidado'])
  })
})

describe('transições', () => {
  it.each([
    ['previsto', 'pendente'],
    ['previsto', 'liquidado'],
    ['previsto', 'cancelado'],
    ['pendente', 'liquidado'],
    ['pendente', 'cancelado'],
    ['liquidado', 'conciliado'],
    ['liquidado', 'estornado'],
    ['conciliado', 'estornado'],
  ] as const)('permite %s -> %s', (de, para) => {
    expect(podeTransicionar(de, para)).toBe(true)
  })

  it.each([
    ['liquidado', 'previsto'],
    ['liquidado', 'cancelado'],
    ['conciliado', 'liquidado'],
    ['cancelado', 'previsto'],
    ['estornado', 'liquidado'],
  ] as const)('proíbe %s -> %s', (de, para) => {
    expect(podeTransicionar(de, para)).toBe(false)
  })

  it('liquidado não pode ser cancelado, só estornado', () => {
    expect(() => assertTransicao('liquidado', 'cancelado')).toThrow(LancamentoInvalidoError)
  })

  it('cancelado e estornado são terminais', () => {
    const todos = [
      'previsto',
      'pendente',
      'liquidado',
      'conciliado',
      'cancelado',
      'estornado',
    ] as const
    for (const destino of todos) {
      expect(podeTransicionar('cancelado', destino)).toBe(false)
      expect(podeTransicionar('estornado', destino)).toBe(false)
    }
  })
})

describe('direção', () => {
  it('receita entra, despesa sai', () => {
    expect(direcaoPara('receita')).toBe(1)
    expect(direcaoPara('despesa')).toBe(-1)
  })

  it('transferência e ajuste exigem direção explícita', () => {
    expect(direcaoPara('transferencia', -1)).toBe(-1)
    expect(direcaoPara('ajuste', 1)).toBe(1)
    expect(() => direcaoPara('transferencia')).toThrow(LancamentoInvalidoError)
  })

  it('rejeita direção que contraria o tipo', () => {
    expect(() => direcaoPara('receita', -1)).toThrow(LancamentoInvalidoError)
  })
})

describe('validarLancamento', () => {
  const base = {
    kind: 'despesa' as const,
    amountCents: cents(1000),
    direction: -1 as const,
    status: 'liquidado' as const,
    competenceDate: isoDate('2026-09-18'),
    settledDate: isoDate('2026-09-18'),
    nature: 'variavel' as const,
    categoryId: 'cat-1',
    transferGroupId: null,
    adjustmentReason: null,
  }

  it('aceita uma despesa bem formada', () => {
    expect(() => validarLancamento(base)).not.toThrow()
  })

  it('rejeita valor zero ou negativo: o sinal vem da direção', () => {
    expect(() => validarLancamento({ ...base, amountCents: cents(0) })).toThrow(
      LancamentoInvalidoError,
    )
    expect(() => validarLancamento({ ...base, amountCents: cents(-1) })).toThrow(
      LancamentoInvalidoError,
    )
  })

  it('exige data de liquidação quando liquidado', () => {
    expect(() => validarLancamento({ ...base, settledDate: null })).toThrow(
      LancamentoInvalidoError,
    )
  })

  it('proíbe data de liquidação quando ainda previsto', () => {
    expect(() => validarLancamento({ ...base, status: 'previsto' })).toThrow(
      LancamentoInvalidoError,
    )
  })

  it('transferência exige grupo e proíbe categoria', () => {
    const transferencia = {
      ...base,
      kind: 'transferencia' as const,
      nature: null,
      categoryId: null,
      transferGroupId: 'grupo-1',
    }
    expect(() => validarLancamento(transferencia)).not.toThrow()
    expect(() => validarLancamento({ ...transferencia, transferGroupId: null })).toThrow(
      LancamentoInvalidoError,
    )
    expect(() => validarLancamento({ ...transferencia, categoryId: 'cat-1' })).toThrow(
      LancamentoInvalidoError,
    )
  })

  it('ajuste exige motivo', () => {
    const ajuste = {
      ...base,
      kind: 'ajuste' as const,
      nature: null,
      categoryId: null,
      adjustmentReason: null,
    }
    expect(() => validarLancamento(ajuste)).toThrow(LancamentoInvalidoError)
    expect(() =>
      validarLancamento({ ...ajuste, adjustmentReason: 'divergência de extrato' }),
    ).not.toThrow()
  })

  it('natureza só existe em receita e despesa', () => {
    const ajusteComNatureza = {
      ...base,
      kind: 'ajuste' as const,
      categoryId: null,
      adjustmentReason: 'motivo',
      nature: 'fixa' as const,
    }
    expect(() => validarLancamento(ajusteComNatureza)).toThrow(LancamentoInvalidoError)
  })
})

describe('estaAtrasado', () => {
  const hoje = isoDate('2026-09-18')

  it('vencido e não liquidado está atrasado', () => {
    expect(estaAtrasado({ competenceDate: isoDate('2026-09-10'), status: 'previsto' }, hoje)).toBe(
      true,
    )
    expect(estaAtrasado({ competenceDate: isoDate('2026-09-10'), status: 'pendente' }, hoje)).toBe(
      true,
    )
  })

  it('vencido mas liquidado não está atrasado', () => {
    expect(estaAtrasado({ competenceDate: isoDate('2026-09-10'), status: 'liquidado' }, hoje)).toBe(
      false,
    )
  })

  it('cancelado nunca está atrasado', () => {
    expect(estaAtrasado({ competenceDate: isoDate('2026-01-01'), status: 'cancelado' }, hoje)).toBe(
      false,
    )
  })

  it('vence hoje ainda não está atrasado', () => {
    expect(estaAtrasado({ competenceDate: hoje, status: 'previsto' }, hoje)).toBe(false)
  })
})

describe('MOVEM_SALDO', () => {
  it('só liquidado e conciliado movem saldo', () => {
    expect(MOVEM_SALDO).toEqual(['liquidado', 'conciliado'])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- transaction`
Expected: FAIL — `Failed to resolve import "../../src/domain/transaction"`.

- [ ] **Step 3: Implementar `src/domain/transaction.ts`**

```ts
import { comparaDatas } from './dates'
import type {
  Cents,
  IsoDate,
  TransactionKind,
  TransactionNature,
  TransactionStatus,
} from './types'

export class LancamentoInvalidoError extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'LancamentoInvalidoError'
  }
}

/**
 * Um lançamento pode nascer já liquidado. Registrar a despesa que acabou de
 * ser paga é o caso mais comum; obrigá-la a passar por `previsto` seria
 * cerimônia inútil.
 */
export const STATUS_INICIAIS = [
  'previsto',
  'pendente',
  'liquidado',
] as const satisfies readonly TransactionStatus[]

/** Só estes dois movem o saldo. Ver PRODUCT.md §6.1. */
export const MOVEM_SALDO = [
  'liquidado',
  'conciliado',
] as const satisfies readonly TransactionStatus[]

const TRANSICOES: Record<TransactionStatus, readonly TransactionStatus[]> = {
  previsto: ['pendente', 'liquidado', 'cancelado'],
  pendente: ['liquidado', 'cancelado'],
  liquidado: ['conciliado', 'estornado'],
  conciliado: ['estornado'],
  cancelado: [],
  estornado: [],
}

export function podeTransicionar(de: TransactionStatus, para: TransactionStatus): boolean {
  return TRANSICOES[de].includes(para)
}

export function assertTransicao(de: TransactionStatus, para: TransactionStatus): void {
  if (!podeTransicionar(de, para)) {
    throw new LancamentoInvalidoError(`Transição proibida: ${de} -> ${para}`)
  }
}

/**
 * Receita sempre entra, despesa sempre sai. Transferência e ajuste podem ir
 * para qualquer lado, então exigem direção explícita de quem chama.
 */
export function direcaoPara(kind: TransactionKind, explicita?: -1 | 1): -1 | 1 {
  const fixa: Partial<Record<TransactionKind, -1 | 1>> = { receita: 1, despesa: -1 }
  const esperada = fixa[kind]

  if (esperada !== undefined) {
    if (explicita !== undefined && explicita !== esperada) {
      throw new LancamentoInvalidoError(
        `Tipo "${kind}" exige direção ${esperada}, recebido ${explicita}`,
      )
    }
    return esperada
  }

  if (explicita === undefined) {
    throw new LancamentoInvalidoError(`Tipo "${kind}" exige direção explícita`)
  }
  return explicita
}

export interface LancamentoValidavel {
  kind: TransactionKind
  amountCents: Cents
  direction: -1 | 1
  status: TransactionStatus
  competenceDate: IsoDate
  settledDate: IsoDate | null
  nature: TransactionNature | null
  categoryId: string | null
  transferGroupId: string | null
  adjustmentReason: string | null
}

const MOVEM_SALDO_SET: ReadonlySet<TransactionStatus> = new Set(MOVEM_SALDO)

/**
 * As mesmas invariantes existem como CHECK no banco. Aqui elas falham cedo,
 * com mensagem legível; lá elas falham sempre, mesmo se este código mudar.
 */
export function validarLancamento(lancamento: LancamentoValidavel): void {
  const { kind, amountCents, direction, status, settledDate, nature } = lancamento

  if (amountCents <= 0) {
    throw new LancamentoInvalidoError(
      'Valor precisa ser positivo; o efeito contábil vem da direção, não do sinal',
    )
  }

  direcaoPara(kind, direction)

  const movimentaSaldo = MOVEM_SALDO_SET.has(status)
  if (movimentaSaldo && settledDate === null) {
    throw new LancamentoInvalidoError(`Status "${status}" exige data de liquidação`)
  }
  if (!movimentaSaldo && settledDate !== null) {
    throw new LancamentoInvalidoError(`Status "${status}" não pode ter data de liquidação`)
  }

  const aceitaNatureza = kind === 'receita' || kind === 'despesa'
  if (aceitaNatureza && nature === null) {
    throw new LancamentoInvalidoError(`Tipo "${kind}" exige natureza fixa ou variável`)
  }
  if (!aceitaNatureza && nature !== null) {
    throw new LancamentoInvalidoError(`Tipo "${kind}" não aceita natureza`)
  }

  if (kind === 'transferencia') {
    if (lancamento.transferGroupId === null) {
      throw new LancamentoInvalidoError('Transferência exige grupo que ligue os dois lados')
    }
    if (lancamento.categoryId !== null) {
      throw new LancamentoInvalidoError(
        'Transferência não é receita nem despesa, não leva categoria',
      )
    }
  }

  if (kind === 'ajuste' && !lancamento.adjustmentReason?.trim()) {
    throw new LancamentoInvalidoError('Ajuste de saldo exige motivo registrado')
  }
}

/**
 * `atrasado` é derivado, nunca gravado. Estado gravado precisaria de um
 * processo periódico para virá-lo, e um processo que falha deixa o dado
 * mentindo. Ver a spec, seção 5.5.
 */
export function estaAtrasado(
  lancamento: { competenceDate: IsoDate; status: TransactionStatus },
  hoje: IsoDate,
): boolean {
  const aguardando = lancamento.status === 'previsto' || lancamento.status === 'pendente'
  return aguardando && comparaDatas(lancamento.competenceDate, hoje) < 0
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- transaction`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/transaction.ts tests/unit/transaction.test.ts
git commit -m "feat(domain): máquina de estados e invariantes do lançamento

Liquidado não pode ser cancelado, só estornado. Atrasado é derivado, não
gravado. MOVEM_SALDO é a única definição do que conta para saldo."
```

---

### Task 5: `domain/balance.ts` — saldo calculado e saldo estimado

**Files:**
- Create: `src/domain/balance.ts`
- Test: `tests/unit/balance.test.ts`

**Interfaces:**
- Consumes: `Cents`, `TransactionStatus` de `types.ts`; `cents`, `sumCents` de `money.ts`; `MOVEM_SALDO` de `transaction.ts`.
- Produces:
  - `interface LinhaRazao { signedAmountCents: Cents; status: TransactionStatus; settledAt: Date | null }`
  - `interface EntradaSaldo { initialBalanceCents: Cents; linhas: LinhaRazao[]; lastReconciledAt: Date | null }`
  - `interface ResultadoSaldo { balanceCents: Cents; isEstimated: boolean }`
  - `calcularSaldo(entrada: EntradaSaldo): ResultadoSaldo`
  - `somarSaldos(resultados: ResultadoSaldo[]): ResultadoSaldo`

`somarSaldos` é o total da tela inicial. Se **qualquer** conta estiver estimada, o total está estimado — arredondar isso para "confiável" é exatamente o tipo de mentira que o §6.2 proíbe.

- [ ] **Step 1: Escrever os testes que falham**

`tests/unit/balance.test.ts`:

```ts
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { calcularSaldo, somarSaldos, type LinhaRazao } from '../../src/domain/balance'
import { cents } from '../../src/domain/money'
import type { TransactionStatus } from '../../src/domain/types'

function linha(
  valor: number,
  status: TransactionStatus = 'liquidado',
  settledAt: Date | null = new Date('2026-09-10T00:00:00Z'),
): LinhaRazao {
  return { signedAmountCents: cents(valor), status, settledAt }
}

describe('calcularSaldo', () => {
  it('soma apenas liquidado e conciliado', () => {
    const { balanceCents } = calcularSaldo({
      initialBalanceCents: cents(100_00),
      linhas: [
        linha(50_00, 'liquidado'),
        linha(25_00, 'conciliado'),
        linha(-999_00, 'previsto', null),
        linha(-999_00, 'pendente', null),
        linha(-999_00, 'cancelado', null),
        linha(-999_00, 'estornado', null),
      ],
      lastReconciledAt: null,
    })
    expect(balanceCents).toBe(175_00)
  })

  it('sem lançamentos, o saldo é o inicial', () => {
    expect(
      calcularSaldo({ initialBalanceCents: cents(42), linhas: [], lastReconciledAt: null })
        .balanceCents,
    ).toBe(42)
  })

  it('conta nunca conciliada é estimada', () => {
    expect(
      calcularSaldo({ initialBalanceCents: cents(0), linhas: [], lastReconciledAt: null })
        .isEstimated,
    ).toBe(true)
  })

  it('conciliada e sem movimento posterior não é estimada', () => {
    const resultado = calcularSaldo({
      initialBalanceCents: cents(0),
      linhas: [linha(100, 'conciliado', new Date('2026-09-01T00:00:00Z'))],
      lastReconciledAt: new Date('2026-09-05T00:00:00Z'),
    })
    expect(resultado.isEstimated).toBe(false)
  })

  it('movimento depois da conciliação volta a estimar', () => {
    const resultado = calcularSaldo({
      initialBalanceCents: cents(0),
      linhas: [linha(100, 'liquidado', new Date('2026-09-10T00:00:00Z'))],
      lastReconciledAt: new Date('2026-09-05T00:00:00Z'),
    })
    expect(resultado.isEstimated).toBe(true)
  })
})

describe('somarSaldos', () => {
  it('soma os valores', () => {
    expect(
      somarSaldos([
        { balanceCents: cents(100), isEstimated: false },
        { balanceCents: cents(250), isEstimated: false },
      ]),
    ).toEqual({ balanceCents: 350, isEstimated: false })
  })

  it('uma conta estimada contamina o total', () => {
    expect(
      somarSaldos([
        { balanceCents: cents(100), isEstimated: false },
        { balanceCents: cents(250), isEstimated: true },
      ]).isEstimated,
    ).toBe(true)
  })

  it('lista vazia é zero e não é estimada', () => {
    expect(somarSaldos([])).toEqual({ balanceCents: 0, isEstimated: false })
  })
})

describe('invariantes', () => {
  const geradorLinha = fc.record({
    signedAmountCents: fc.integer({ min: -1_000_000, max: 1_000_000 }),
    status: fc.constantFrom<TransactionStatus>(
      'previsto',
      'pendente',
      'liquidado',
      'conciliado',
      'cancelado',
      'estornado',
    ),
  })

  it('INVARIANTE: o saldo independe da ordem de inserção', () => {
    fc.assert(
      fc.property(fc.array(geradorLinha, { maxLength: 60 }), (cruas) => {
        const linhas: LinhaRazao[] = cruas.map((c) => ({
          signedAmountCents: cents(c.signedAmountCents),
          status: c.status,
          settledAt: null,
        }))
        const entrada = { initialBalanceCents: cents(0), lastReconciledAt: null }

        const direto = calcularSaldo({ ...entrada, linhas }).balanceCents
        const invertido = calcularSaldo({ ...entrada, linhas: [...linhas].reverse() }).balanceCents

        expect(direto).toBe(invertido)
      }),
    )
  })

  it('INVARIANTE: transferência entre contas incluídas não altera o total', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (valor) => {
        const origem = calcularSaldo({
          initialBalanceCents: cents(10_000_00),
          linhas: [linha(-valor)],
          lastReconciledAt: null,
        })
        const destino = calcularSaldo({
          initialBalanceCents: cents(0),
          linhas: [linha(valor)],
          lastReconciledAt: null,
        })

        expect(somarSaldos([origem, destino]).balanceCents).toBe(10_000_00)
      }),
    )
  })

  it('INVARIANTE: estorno anula exatamente o original', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (valor) => {
        const semNada = calcularSaldo({
          initialBalanceCents: cents(500_00),
          linhas: [],
          lastReconciledAt: null,
        }).balanceCents

        // O original vira `estornado` e deixa de contar; a linha de estorno
        // entra liquidada com o sinal oposto.
        const comEstorno = calcularSaldo({
          initialBalanceCents: cents(500_00),
          linhas: [linha(-valor, 'estornado', null), linha(valor, 'liquidado')],
          lastReconciledAt: null,
        }).balanceCents

        expect(comEstorno).toBe(semNada + valor)
      }),
    )
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- balance`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar `src/domain/balance.ts`**

```ts
import { cents, sumCents } from './money'
import { MOVEM_SALDO } from './transaction'
import type { Cents, TransactionStatus } from './types'

export interface LinhaRazao {
  signedAmountCents: Cents
  status: TransactionStatus
  /** Quando a linha foi liquidada. Nulo enquanto não move saldo. */
  settledAt: Date | null
}

export interface EntradaSaldo {
  initialBalanceCents: Cents
  linhas: LinhaRazao[]
  lastReconciledAt: Date | null
}

export interface ResultadoSaldo {
  balanceCents: Cents
  isEstimated: boolean
}

const CONTAM: ReadonlySet<TransactionStatus> = new Set(MOVEM_SALDO)

/**
 * Saldo calculado = saldo inicial + soma dos lançamentos que movem saldo.
 *
 * `isEstimated` responde à exigência do §6.1: saldo que ainda não foi
 * conferido com uma fonte externa precisa se anunciar como estimativa. É
 * verdadeiro quando a conta nunca foi conciliada, ou quando houve movimento
 * depois da última conciliação.
 */
export function calcularSaldo(entrada: EntradaSaldo): ResultadoSaldo {
  const contadas = entrada.linhas.filter((linha) => CONTAM.has(linha.status))

  const balanceCents = cents(
    entrada.initialBalanceCents + sumCents(contadas.map((linha) => linha.signedAmountCents)),
  )

  const conciliadaAlgumaVez = entrada.lastReconciledAt !== null
  const houveMovimentoDepois =
    conciliadaAlgumaVez &&
    contadas.some(
      (linha) => linha.settledAt !== null && linha.settledAt > entrada.lastReconciledAt!,
    )

  return {
    balanceCents,
    isEstimated: !conciliadaAlgumaVez || houveMovimentoDepois,
  }
}

/**
 * Total da tela inicial. Uma única conta estimada torna o total estimado:
 * apresentar um total como confirmado quando uma das parcelas não é seria
 * exatamente a dupla contagem disfarçada que o §6.2 proíbe.
 */
export function somarSaldos(resultados: ResultadoSaldo[]): ResultadoSaldo {
  return {
    balanceCents: sumCents(resultados.map((resultado) => resultado.balanceCents)),
    isEstimated: resultados.some((resultado) => resultado.isEstimated),
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- balance`
Expected: PASS, incluindo as três propriedades — ordem, transferência neutra e estorno exato.

- [ ] **Step 5: Commit**

```bash
git add src/domain/balance.ts tests/unit/balance.test.ts
git commit -m "feat(domain): saldo calculado com marca de estimado

Três das quatro invariantes financeiras do PRODUCT.md §16 viram teste de
propriedade aqui: ordem irrelevante, transferência neutra, estorno exato.
Uma conta estimada contamina o total, de propósito."
```

---

### Task 6: `domain/reconciliation.ts` — diferença e decisão

**Files:**
- Create: `src/domain/reconciliation.ts`
- Test: `tests/unit/reconciliation.test.ts`

**Interfaces:**
- Consumes: `Cents` de `types.ts`; `cents`, `subCents` de `money.ts`.
- Produces:
  - `type DecisaoConciliacao = 'ajuste_criado' | 'lancamento_localizado' | 'duplicidade_removida' | 'adiado'`
  - `interface ResultadoConciliacao { differenceCents: Cents; confere: boolean; decisoesPossiveis: DecisaoConciliacao[] }`
  - `conciliar(reportedCents: Cents, calculatedCents: Cents): ResultadoConciliacao`

O §5.3.1 é explícito: em divergência, o sistema mostra a diferença e **pede uma decisão**. Não escolhe sozinho, não reescreve histórico. Este módulo calcula e oferece; quem decide é o usuário.

- [ ] **Step 1: Escrever os testes que falham**

`tests/unit/reconciliation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { cents } from '../../src/domain/money'
import { conciliar } from '../../src/domain/reconciliation'

describe('conciliar', () => {
  it('sem diferença, confere e só resta confirmar', () => {
    const resultado = conciliar(cents(150_00), cents(150_00))
    expect(resultado.differenceCents).toBe(0)
    expect(resultado.confere).toBe(true)
    expect(resultado.decisoesPossiveis).toEqual([])
  })

  it('extrato maior que o razão: falta lançamento de entrada', () => {
    const resultado = conciliar(cents(200_00), cents(150_00))
    expect(resultado.differenceCents).toBe(50_00)
    expect(resultado.confere).toBe(false)
  })

  it('extrato menor que o razão: sobra lançamento no sistema', () => {
    const resultado = conciliar(cents(100_00), cents(150_00))
    expect(resultado.differenceCents).toBe(-50_00)
    expect(resultado.confere).toBe(false)
  })

  it('havendo diferença, oferece as quatro decisões do §5.3.1', () => {
    expect(conciliar(cents(100_00), cents(150_00)).decisoesPossiveis).toEqual([
      'lancamento_localizado',
      'duplicidade_removida',
      'ajuste_criado',
      'adiado',
    ])
  })

  it('a ordem das decisões não é cosmética', () => {
    // Procurar o lançamento que falta vem antes de criar ajuste. Ajuste é a
    // saída quando a investigação não resolve, não o primeiro impulso.
    const [primeira] = conciliar(cents(100_00), cents(150_00)).decisoesPossiveis
    expect(primeira).toBe('lancamento_localizado')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- reconciliation`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar `src/domain/reconciliation.ts`**

```ts
import { cents, subCents } from './money'
import type { Cents } from './types'

export type DecisaoConciliacao =
  | 'lancamento_localizado'
  | 'duplicidade_removida'
  | 'ajuste_criado'
  | 'adiado'

export interface ResultadoConciliacao {
  /** Informado menos calculado. Positivo: falta entrada no razão. */
  differenceCents: Cents
  confere: boolean
  decisoesPossiveis: DecisaoConciliacao[]
}

/**
 * Ordem deliberada: investigar antes de ajustar. Criar um ajuste é a saída
 * quando a busca não resolve, não o primeiro impulso — o §5.3.1 exige que o
 * ajuste registre valor, data, motivo e origem, e que nunca reescreva
 * lançamento anterior em silêncio.
 */
const DECISOES: DecisaoConciliacao[] = [
  'lancamento_localizado',
  'duplicidade_removida',
  'ajuste_criado',
  'adiado',
]

export function conciliar(reportedCents: Cents, calculatedCents: Cents): ResultadoConciliacao {
  const differenceCents = subCents(reportedCents, calculatedCents)
  const confere = differenceCents === cents(0)

  return {
    differenceCents,
    confere,
    decisoesPossiveis: confere ? [] : [...DECISOES],
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- reconciliation`
Expected: PASS.

- [ ] **Step 5: Rodar a suíte inteira do domínio**

Run: `npm test`
Expected: PASS em tudo. O domínio está completo e roda sem banco.

- [ ] **Step 6: Commit**

```bash
git add src/domain/reconciliation.ts tests/unit/reconciliation.test.ts
git commit -m "feat(domain): diferença de conciliação e decisões possíveis

O módulo calcula e oferece; quem decide é o usuário. Investigar vem antes
de ajustar, como manda o PRODUCT.md §5.3.1."
```

---

### Task 7: Runner de migração e migração 001 — role da aplicação, `users`, `sessions`

**Files:**
- Create: `scripts/migrate.ts`, `migrations/001_base.sql`
- Create: `tests/integration/setup.ts`, `tests/integration/helpers.ts`
- Test: `tests/integration/001-base.test.ts`
- Modify: `vitest.config.ts` (adicionar `globalSetup` ao projeto de integração)

**Interfaces:**
- Consumes: nada do código anterior.
- Produces:
  - `npm run migrate` — aplica migrações; **recusa** rodar contra a porta 6543.
  - Tabelas `users`, `sessions`; role `money_tree_app`; função `app_user_id()`.
  - `tests/integration/helpers.ts` exporta `sqlAdmin`, `sqlApp`, `comoUsuario(userId, fn)`, `criarUsuario(email?)`, `limparBanco()`.

**Nota de correção da spec:** ao detalhar o schema apareceu um campo que a spec listou no PRODUCT.md §5.3 mas esqueceu na tabela: **`description`**. Ele entra na migração 003 como `text not null`. Registrado aqui porque a spec é o documento que viaja com o plano.

- [ ] **Step 1: Escrever o runner de migração**

`scripts/migrate.ts`:

```ts
import { execFileSync } from 'node:child_process'

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL

if (!url) {
  console.error('Defina MIGRATION_DATABASE_URL (porta 5432, modo sessão).')
  process.exit(1)
}

/**
 * O pooler em modo transação (6543) não mantém sessão entre comandos, e
 * migração precisa de sessão: advisory lock, DDL transacional e SET.
 * Falhar aqui é muito melhor do que falhar no meio de um ALTER TABLE.
 */
if (new URL(url).port === '6543') {
  console.error(
    'Migração na porta 6543 quebra. Use a 5432 (modo sessão) em MIGRATION_DATABASE_URL.',
  )
  process.exit(1)
}

const direcao = process.argv[2] ?? 'up'

execFileSync(
  'npx',
  [
    'node-pg-migrate',
    direcao,
    '--migrations-dir',
    'migrations',
    '--migration-file-language',
    'sql',
    '--envPath',
    '.env.local',
  ],
  { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url }, shell: true },
)
```

- [ ] **Step 2: Escrever a migração 001**

`migrations/001_base.sql`:

```sql
-- Up Migration

-- O role da aplicação. Sem BYPASSRLS, sem CREATEDB, sem SUPERUSER.
-- A senha é definida fora da migração, no painel do provedor, para não
-- entrar no repositório.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'money_tree_app') then
    create role money_tree_app login;
  end if;
end
$$;

grant usage on schema public to money_tree_app;

-- Lê o usuário da sessão. `true` no segundo argumento faz devolver NULL em
-- vez de erro quando a variável não foi definida: conexão sem SET LOCAL
-- simplesmente não enxerga nada, em vez de explodir.
create or replace function app_user_id() returns uuid
language sql stable
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create table users (
  id               uuid primary key default gen_random_uuid(),
  email            text not null,
  password_hash    text not null,
  display_name     text not null,
  locale           text not null default 'pt-BR',
  timezone         text not null default 'America/Sao_Paulo',
  currency         char(3) not null default 'BRL',
  month_start_day  smallint not null default 1,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint users_month_start_day_valido check (month_start_day between 1 and 31),
  -- A v1 opera só em BRL. O §5.2 proíbe habilitar outra moeda antes de
  -- definir cotação, instante de conversão, arredondamento e ganho cambial.
  constraint users_currency_brl check (currency = 'BRL')
);

create unique index users_email_unico on users (lower(email));

create table sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users (id) on delete cascade,
  token_hash       text not null,
  expires_at       timestamptz not null,
  last_seen_at     timestamptz not null default now(),
  revoked_at       timestamptz,
  user_agent_hash  text,
  ip_hash          text,
  created_at       timestamptz not null default now()
);

create unique index sessions_token_hash_unico on sessions (token_hash);
create index sessions_user_id on sessions (user_id);

-- RLS. FORCE porque o dono da tabela ignoraria a policy sem ele.
alter table users    enable row level security;
alter table users    force  row level security;
alter table sessions enable row level security;
alter table sessions force  row level security;

create policy users_proprio on users
  using (id = app_user_id())
  with check (id = app_user_id());

create policy sessions_proprio on sessions
  using (user_id = app_user_id())
  with check (user_id = app_user_id());

grant select, insert, update on users to money_tree_app;
grant select, insert, update, delete on sessions to money_tree_app;

-- Down Migration

drop table if exists sessions;
drop table if exists users;
drop function if exists app_user_id();
```

Duas coisas a notar. `sessions` aceita `delete` porque encerrar sessão apaga de verdade — sessão não é dado financeiro e não precisa de trilha. `users` não aceita `delete` pelo role da aplicação: apagar usuário é operação administrativa deliberada.

- [ ] **Step 3: Subir o Postgres de teste**

```bash
docker compose -f docker-compose.test.yml up -d
docker compose -f docker-compose.test.yml ps
```

Expected: o serviço aparece como `healthy`.

- [ ] **Step 4: Escrever o `globalSetup` da integração**

`tests/integration/setup.ts`:

```ts
import { execFileSync } from 'node:child_process'

export default function setup() {
  const url = process.env.TEST_DATABASE_URL
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL não definida. Suba o Docker: docker compose -f docker-compose.test.yml up -d',
    )
  }

  // Migrações do zero, a cada execução. Se a sequência só funciona em banco
  // que já existia, ela está quebrada e é melhor descobrir agora.
  execFileSync(
    'npx',
    [
      'node-pg-migrate',
      'up',
      '--migrations-dir',
      'migrations',
      '--migration-file-language',
      'sql',
    ],
    { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url }, shell: true },
  )
}
```

Em `vitest.config.ts`, no projeto `integration`, adicione:

```ts
globalSetup: ['tests/integration/setup.ts'],
setupFiles: ['tests/integration/env.ts'],
```

`tests/integration/env.ts`:

```ts
// Carrega .env.local sem dependência extra: Node 20.6+ tem --env-file, mas
// o Vitest não o repassa. Ler manualmente dispensa o dotenv.
import { existsSync, readFileSync } from 'node:fs'

if (existsSync('.env.local')) {
  for (const linha of readFileSync('.env.local', 'utf8').split('\n')) {
    const casou = /^([A-Z_]+)=(.*)$/.exec(linha.trim())
    if (casou && !process.env[casou[1]]) {
      process.env[casou[1]] = casou[2]
    }
  }
}
```

- [ ] **Step 5: Escrever os helpers de integração**

`tests/integration/helpers.ts`:

```ts
import postgres from 'postgres'

const url = process.env.TEST_DATABASE_URL!

/** Conexão de administração: ignora RLS, usada só para preparar e limpar. */
export const sqlAdmin = postgres(url, { prepare: false, onnotice: () => {} })

/**
 * Conexão da aplicação. No banco de teste o role money_tree_app existe mas
 * não tem senha, então reusamos a mesma URL trocando o usuário via SET ROLE
 * dentro da transação. Isso reproduz o comportamento de produção: RLS ativa,
 * sem bypass.
 */
export async function comoUsuario<T>(
  userId: string,
  fn: (sql: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return sqlAdmin.begin(async (tx) => {
    await tx`set local role money_tree_app`
    await tx`select set_config('app.user_id', ${userId}, true)`
    return fn(tx)
  })
}

export async function criarUsuario(email = `teste-${crypto.randomUUID()}@exemplo.com`) {
  const [usuario] = await sqlAdmin<{ id: string }[]>`
    insert into users (email, password_hash, display_name)
    values (${email}, 'hash-de-teste', 'Usuário de Teste')
    returning id
  `
  return usuario.id
}

export async function limparBanco() {
  await sqlAdmin`truncate users restart identity cascade`
}
```

- [ ] **Step 6: Escrever o teste de integração da 001**

`tests/integration/001-base.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { comoUsuario, criarUsuario, limparBanco, sqlAdmin } from './helpers'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

describe('migração 001', () => {
  it('cria o role da aplicação sem poder de bypass', async () => {
    const [role] = await sqlAdmin<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      select rolsuper, rolbypassrls from pg_roles where rolname = 'money_tree_app'
    `
    expect(role.rolsuper).toBe(false)
    expect(role.rolbypassrls).toBe(false)
  })

  it('força RLS em users e sessions', async () => {
    const tabelas = await sqlAdmin<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
      select relname, relrowsecurity, relforcerowsecurity
      from pg_class
      where relname in ('users', 'sessions')
      order by relname
    `
    expect(tabelas).toHaveLength(2)
    for (const tabela of tabelas) {
      expect(tabela.relrowsecurity).toBe(true)
      expect(tabela.relforcerowsecurity).toBe(true)
    }
  })

  it('rejeita e-mail duplicado ignorando maiúsculas', async () => {
    await criarUsuario('Pessoa@Exemplo.com')
    await expect(criarUsuario('pessoa@exemplo.com')).rejects.toThrow()
  })

  it('rejeita dia de início do mês fora de 1..31', async () => {
    await expect(sqlAdmin`
      insert into users (email, password_hash, display_name, month_start_day)
      values ('x@exemplo.com', 'h', 'X', 32)
    `).rejects.toThrow()
  })

  it('rejeita moeda diferente de BRL, como manda o §5.2', async () => {
    await expect(sqlAdmin`
      insert into users (email, password_hash, display_name, currency)
      values ('y@exemplo.com', 'h', 'Y', 'USD')
    `).rejects.toThrow()
  })

  it('AMEAÇA T3: um usuário não enxerga o outro', async () => {
    const usuarioA = await criarUsuario()
    const usuarioB = await criarUsuario()

    const vistoPorA = await comoUsuario(usuarioA, (sql) => sql`select id from users`)
    expect(vistoPorA.map((linha) => linha.id)).toEqual([usuarioA])

    const vistoPorB = await comoUsuario(usuarioB, (sql) => sql`select id from users`)
    expect(vistoPorB.map((linha) => linha.id)).toEqual([usuarioB])
  })

  it('AMEAÇA T4: sem app.user_id definido, não enxerga nada', async () => {
    await criarUsuario()
    const vazio = await sqlAdmin.begin(async (tx) => {
      await tx`set local role money_tree_app`
      return tx`select id from users`
    })
    expect(vazio).toHaveLength(0)
  })
})
```

- [ ] **Step 7: Rodar e ver falhar**

Run: `npm run test:integration`
Expected: FAIL — as migrações ainda não foram aplicadas no banco de teste na primeira execução; o `globalSetup` as aplica, então a falha esperada é apenas se algo estiver errado no SQL. Se passar de primeira, confirme que o `globalSetup` realmente rodou (a saída do `node-pg-migrate` aparece no console).

- [ ] **Step 8: Corrigir o que falhar e rodar de novo**

Run: `npm run test:integration`
Expected: PASS — 7 testes.

- [ ] **Step 9: Commit**

```bash
git add scripts/migrate.ts migrations/001_base.sql tests/integration vitest.config.ts package.json
git commit -m "feat(db): role da aplicação, users, sessions e RLS forçada

O runner recusa rodar na porta 6543: o pooler em modo transação não
mantém sessão e migração precisa de sessão. As ameaças T3 e T4 do modelo
de ameaças viram teste: acesso cruzado bloqueado, e conexão sem
app.user_id não enxerga linha nenhuma."
```

---

### Task 8: Migração 002 — `accounts`, `categories` e as catorze categorias

**Files:**
- Create: `migrations/002_accounts_categories.sql`
- Test: `tests/integration/002-accounts-categories.test.ts`

**Interfaces:**
- Consumes: `users`, `app_user_id()` da migração 001.
- Produces: tabelas `accounts` e `categories`; função `seed_categorias_padrao(p_user_id uuid)`.

- [ ] **Step 1: Escrever o teste que falha**

`tests/integration/002-accounts-categories.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { comoUsuario, criarUsuario, limparBanco, sqlAdmin } from './helpers'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

describe('migração 002', () => {
  it('cartão, investimento e empréstimo ficam fora do disponível por padrão', async () => {
    const usuario = await criarUsuario()

    const contas = await comoUsuario(usuario, async (sql) => {
      await sql`
        insert into accounts (user_id, name, type, initial_balance_cents, initial_balance_date)
        values
          (${usuario}, 'Corrente', 'corrente', 0, '2026-09-01'),
          (${usuario}, 'Cartão', 'cartao_credito', 0, '2026-09-01'),
          (${usuario}, 'CDB', 'investimento', 0, '2026-09-01'),
          (${usuario}, 'Financiamento', 'emprestimo', 0, '2026-09-01')
      `
      return sql<{ type: string; include_in_available: boolean }[]>`
        select type, include_in_available from accounts order by type
      `
    })

    const porTipo = Object.fromEntries(contas.map((c) => [c.type, c.include_in_available]))
    expect(porTipo.corrente).toBe(true)
    expect(porTipo.cartao_credito).toBe(false)
    expect(porTipo.investimento).toBe(false)
    expect(porTipo.emprestimo).toBe(false)
  })

  it('rejeita tipo de conta desconhecido', async () => {
    const usuario = await criarUsuario()
    await expect(
      comoUsuario(usuario, (sql) => sql`
        insert into accounts (user_id, name, type, initial_balance_cents, initial_balance_date)
        values (${usuario}, 'X', 'cripto', 0, '2026-09-01')
      `),
    ).rejects.toThrow()
  })

  it('rejeita moeda diferente de BRL', async () => {
    const usuario = await criarUsuario()
    await expect(
      comoUsuario(usuario, (sql) => sql`
        insert into accounts (user_id, name, type, currency, initial_balance_cents, initial_balance_date)
        values (${usuario}, 'X', 'corrente', 'USD', 0, '2026-09-01')
      `),
    ).rejects.toThrow()
  })

  it('semeia as catorze categorias do §5.5', async () => {
    const usuario = await criarUsuario()
    await sqlAdmin`select seed_categorias_padrao(${usuario})`

    const categorias = await comoUsuario(usuario, (sql) => sql<{ name: string; kind: string }[]>`
      select name, kind from categories order by sort_order
    `)

    expect(categorias).toHaveLength(14)
    expect(categorias[0].name).toBe('Moradia')
    expect(categorias.at(-1)?.name).toBe('Outras')
    expect(categorias.find((c) => c.name === 'Renda')?.kind).toBe('receita')
    expect(categorias.find((c) => c.name === 'Moradia')?.kind).toBe('despesa')
  })

  it('subcategoria aponta para a categoria pai', async () => {
    const usuario = await criarUsuario()
    const [filha] = await comoUsuario(usuario, async (sql) => {
      const [pai] = await sql<{ id: string }[]>`
        insert into categories (user_id, name, kind, sort_order)
        values (${usuario}, 'Transporte', 'despesa', 1)
        returning id
      `
      return sql<{ parent_id: string }[]>`
        insert into categories (user_id, name, kind, parent_id, sort_order)
        values (${usuario}, 'Combustível', 'despesa', ${pai.id}, 2)
        returning parent_id
      `
    })
    expect(filha.parent_id).not.toBeNull()
  })

  it('AMEAÇA T3: conta de um usuário é invisível para outro', async () => {
    const usuarioA = await criarUsuario()
    const usuarioB = await criarUsuario()

    await comoUsuario(usuarioA, (sql) => sql`
      insert into accounts (user_id, name, type, initial_balance_cents, initial_balance_date)
      values (${usuarioA}, 'Secreta', 'corrente', 999999, '2026-09-01')
    `)

    const vistoPorB = await comoUsuario(usuarioB, (sql) => sql`select id from accounts`)
    expect(vistoPorB).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test:integration -- 002`
Expected: FAIL — `relation "accounts" does not exist`.

- [ ] **Step 3: Escrever `migrations/002_accounts_categories.sql`**

```sql
-- Up Migration

create type account_type as enum (
  'corrente', 'pagamento', 'poupanca', 'carteira',
  'cartao_credito', 'investimento', 'emprestimo', 'outro'
);

create type category_kind as enum ('receita', 'despesa');

create table accounts (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references users (id) on delete cascade,
  name                    text not null,
  type                    account_type not null,
  institution             text,
  initial_balance_cents   bigint not null default 0,
  initial_balance_date    date not null,
  currency                char(3) not null default 'BRL',

  -- Duas coisas diferentes, de propósito. `is_liquid` descreve o ativo: o
  -- dinheiro pode ser usado hoje. `include_in_available` é escolha do
  -- usuário. O §6.1 soma apenas o que é líquido E incluído.
  is_liquid               boolean not null,
  include_in_available    boolean not null,
  include_in_net_worth    boolean not null default true,

  is_archived             boolean not null default false,
  last_reconciled_at      timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint accounts_currency_brl check (currency = 'BRL'),
  constraint accounts_name_nao_vazio check (length(btrim(name)) > 0)
);

-- Os padrões dependem do tipo, então vêm de gatilho e não de DEFAULT.
-- Limite de cartão não é dinheiro disponível (§5.7), e investimento sem
-- liquidez imediata não entra no saldo disponível (§6.1).
create or replace function accounts_padroes_por_tipo() returns trigger
language plpgsql as $$
begin
  if new.is_liquid is null then
    new.is_liquid := new.type in ('corrente', 'pagamento', 'poupanca', 'carteira');
  end if;
  if new.include_in_available is null then
    new.include_in_available := new.is_liquid;
  end if;
  return new;
end;
$$;

create trigger accounts_padroes
  before insert on accounts
  for each row execute function accounts_padroes_por_tipo();

create index accounts_user_ativas on accounts (user_id) where not is_archived;

create table categories (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users (id) on delete cascade,
  parent_id    uuid references categories (id) on delete restrict,
  name         text not null,
  kind         category_kind not null,
  is_archived  boolean not null default false,
  is_system    boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint categories_name_nao_vazio check (length(btrim(name)) > 0),
  constraint categories_nao_e_propria_pai check (parent_id is distinct from id)
);

create index categories_user_kind on categories (user_id, kind) where not is_archived;
create unique index categories_nome_unico
  on categories (user_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- As catorze do §5.5. Todas editáveis e arquiváveis: `is_system` marca a
-- origem, não impede alteração.
create or replace function seed_categorias_padrao(p_user_id uuid) returns void
language sql as $$
  insert into categories (user_id, name, kind, is_system, sort_order)
  values
    (p_user_id, 'Moradia',                   'despesa', true,  1),
    (p_user_id, 'Supermercado e alimentação','despesa', true,  2),
    (p_user_id, 'Transporte',                'despesa', true,  3),
    (p_user_id, 'Saúde',                     'despesa', true,  4),
    (p_user_id, 'Educação',                  'despesa', true,  5),
    (p_user_id, 'Lazer e entretenimento',    'despesa', true,  6),
    (p_user_id, 'Assinaturas',               'despesa', true,  7),
    (p_user_id, 'Compras pessoais',          'despesa', true,  8),
    (p_user_id, 'Família e dependentes',     'despesa', true,  9),
    (p_user_id, 'Impostos e tarifas',        'despesa', true, 10),
    (p_user_id, 'Dívidas e juros',           'despesa', true, 11),
    (p_user_id, 'Metas e reservas',          'despesa', true, 12),
    (p_user_id, 'Renda',                     'receita', true, 13),
    (p_user_id, 'Outras',                    'despesa', true, 14);
$$;

alter table accounts   enable row level security;
alter table accounts   force  row level security;
alter table categories enable row level security;
alter table categories force  row level security;

create policy accounts_proprio on accounts
  using (user_id = app_user_id()) with check (user_id = app_user_id());

create policy categories_proprio on categories
  using (user_id = app_user_id()) with check (user_id = app_user_id());

grant select, insert, update on accounts to money_tree_app;
grant select, insert, update on categories to money_tree_app;
grant execute on function seed_categorias_padrao(uuid) to money_tree_app;

-- Down Migration

drop function if exists seed_categorias_padrao(uuid);
drop table if exists categories;
drop trigger if exists accounts_padroes on accounts;
drop function if exists accounts_padroes_por_tipo();
drop table if exists accounts;
drop type if exists category_kind;
drop type if exists account_type;
```

`is_liquid` e `include_in_available` são declarados `not null` sem `default`, e o gatilho os preenche quando vêm nulos. Isso força quem insere a decidir conscientemente ou aceitar o padrão do tipo — não existe caminho em que a conta entre no saldo disponível por acidente.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test:integration -- 002`
Expected: PASS — 6 testes.

- [ ] **Step 5: Commit**

```bash
git add migrations/002_accounts_categories.sql tests/integration/002-accounts-categories.test.ts
git commit -m "feat(db): contas, categorias e o seed das catorze do §5.5

Cartão, investimento e empréstimo nascem fora do saldo disponível: limite
de crédito não é dinheiro seu. is_liquid descreve o ativo,
include_in_available é escolha do usuário; os dois existem."
```

---

### Task 9: Migração 003 — o razão, suas constraints e a proibição de apagar

**Files:**
- Create: `migrations/003_transactions.sql`
- Test: `tests/integration/003-transactions.test.ts`

**Interfaces:**
- Consumes: `accounts`, `categories`, `users`, `app_user_id()`.
- Produces: tabelas `transactions` e `ledger_reversals`; tipos `transaction_kind`, `transaction_status`, `transaction_nature`, `transaction_source`; gatilho `transactions_proibe_delete`.

Esta é a tarefa em que o banco assume as invariantes financeiras. Toda regra aqui já existe em `domain/transaction.ts`. A duplicação é deliberada: o TypeScript falha cedo e com mensagem legível, o Postgres falha **sempre**, inclusive contra uma consulta manual no painel do provedor.

- [ ] **Step 1: Escrever o teste que falha**

`tests/integration/003-transactions.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { comoUsuario, criarUsuario, limparBanco, sqlAdmin } from './helpers'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

async function cenario() {
  const usuario = await criarUsuario()
  const { conta, categoria } = await comoUsuario(usuario, async (sql) => {
    const [conta] = await sql<{ id: string }[]>`
      insert into accounts (user_id, name, type, initial_balance_cents, initial_balance_date)
      values (${usuario}, 'Corrente', 'corrente', 0, '2026-09-01')
      returning id
    `
    const [categoria] = await sql<{ id: string }[]>`
      insert into categories (user_id, name, kind, sort_order)
      values (${usuario}, 'Mercado', 'despesa', 1)
      returning id
    `
    return { conta: conta.id, categoria: categoria.id }
  })
  return { usuario, conta, categoria }
}

function despesa(usuario: string, conta: string, categoria: string) {
  return {
    user_id: usuario,
    account_id: conta,
    category_id: categoria,
    kind: 'despesa',
    nature: 'variavel',
    amount_cents: 5000,
    direction: -1,
    status: 'liquidado',
    description: 'Compra no mercado',
    competence_date: '2026-09-18',
    settled_date: '2026-09-18',
  }
}

describe('migração 003', () => {
  it('signed_amount_cents é gerado a partir de valor e direção', async () => {
    const { usuario, conta, categoria } = await cenario()
    const [linha] = await comoUsuario(usuario, (sql) => sql<{ signed_amount_cents: string }[]>`
      insert into transactions ${sql(despesa(usuario, conta, categoria))}
      returning signed_amount_cents
    `)
    expect(Number(linha.signed_amount_cents)).toBe(-5000)
  })

  it('rejeita valor zero ou negativo', async () => {
    const { usuario, conta, categoria } = await cenario()
    for (const valor of [0, -1]) {
      await expect(
        comoUsuario(usuario, (sql) => sql`
          insert into transactions ${sql({ ...despesa(usuario, conta, categoria), amount_cents: valor })}
        `),
      ).rejects.toThrow()
    }
  })

  it('rejeita despesa com direção positiva', async () => {
    const { usuario, conta, categoria } = await cenario()
    await expect(
      comoUsuario(usuario, (sql) => sql`
        insert into transactions ${sql({ ...despesa(usuario, conta, categoria), direction: 1 })}
      `),
    ).rejects.toThrow()
  })

  it('rejeita liquidado sem data de liquidação', async () => {
    const { usuario, conta, categoria } = await cenario()
    await expect(
      comoUsuario(usuario, (sql) => sql`
        insert into transactions ${sql({ ...despesa(usuario, conta, categoria), settled_date: null })}
      `),
    ).rejects.toThrow()
  })

  it('rejeita transferência sem grupo e transferência com categoria', async () => {
    const { usuario, conta, categoria } = await cenario()
    const transferencia = {
      ...despesa(usuario, conta, categoria),
      kind: 'transferencia',
      nature: null,
      category_id: null,
    }

    await expect(
      comoUsuario(usuario, (sql) => sql`insert into transactions ${sql(transferencia)}`),
    ).rejects.toThrow()

    await expect(
      comoUsuario(usuario, (sql) => sql`
        insert into transactions ${sql({
          ...transferencia,
          transfer_group_id: crypto.randomUUID(),
          category_id: categoria,
        })}
      `),
    ).rejects.toThrow()
  })

  it('rejeita ajuste sem motivo', async () => {
    const { usuario, conta, categoria } = await cenario()
    await expect(
      comoUsuario(usuario, (sql) => sql`
        insert into transactions ${sql({
          ...despesa(usuario, conta, categoria),
          kind: 'ajuste',
          nature: null,
          category_id: null,
        })}
      `),
    ).rejects.toThrow()
  })

  it('rejeita natureza em ajuste', async () => {
    const { usuario, conta, categoria } = await cenario()
    await expect(
      comoUsuario(usuario, (sql) => sql`
        insert into transactions ${sql({
          ...despesa(usuario, conta, categoria),
          kind: 'ajuste',
          category_id: null,
          adjustment_reason: 'divergência',
          nature: 'fixa',
        })}
      `),
    ).rejects.toThrow()
  })

  it('AMEAÇA T11: external_id repetido na mesma origem é rejeitado', async () => {
    const { usuario, conta, categoria } = await cenario()
    const comId = { ...despesa(usuario, conta, categoria), source: 'importacao', external_id: 'ofx-1' }

    await comoUsuario(usuario, (sql) => sql`insert into transactions ${sql(comId)}`)
    await expect(
      comoUsuario(usuario, (sql) => sql`insert into transactions ${sql(comId)}`),
    ).rejects.toThrow()
  })

  it('permite external_id nulo repetido, porque lançamento manual não tem origem externa', async () => {
    const { usuario, conta, categoria } = await cenario()
    await comoUsuario(usuario, async (sql) => {
      await sql`insert into transactions ${sql(despesa(usuario, conta, categoria))}`
      await sql`insert into transactions ${sql(despesa(usuario, conta, categoria))}`
    })
    const linhas = await comoUsuario(usuario, (sql) => sql`select id from transactions`)
    expect(linhas).toHaveLength(2)
  })

  it('AMEAÇA T6: lançamento liquidado não pode ser apagado', async () => {
    const { usuario, conta, categoria } = await cenario()
    const [linha] = await comoUsuario(usuario, (sql) => sql<{ id: string }[]>`
      insert into transactions ${sql(despesa(usuario, conta, categoria))} returning id
    `)

    await expect(
      comoUsuario(usuario, (sql) => sql`delete from transactions where id = ${linha.id}`),
    ).rejects.toThrow(/estorno/i)
  })

  it('lançamento previsto pode ser apagado', async () => {
    const { usuario, conta, categoria } = await cenario()
    const [linha] = await comoUsuario(usuario, (sql) => sql<{ id: string }[]>`
      insert into transactions ${sql({
        ...despesa(usuario, conta, categoria),
        status: 'previsto',
        settled_date: null,
      })} returning id
    `)

    await comoUsuario(usuario, (sql) => sql`delete from transactions where id = ${linha.id}`)
    const restantes = await comoUsuario(usuario, (sql) => sql`select id from transactions`)
    expect(restantes).toHaveLength(0)
  })

  it('um estorno só pode existir uma vez por lançamento original', async () => {
    const { usuario, conta, categoria } = await cenario()
    const ids = await comoUsuario(usuario, async (sql) => {
      const [original] = await sql<{ id: string }[]>`
        insert into transactions ${sql(despesa(usuario, conta, categoria))} returning id
      `
      const [estorno] = await sql<{ id: string }[]>`
        insert into transactions ${sql({
          ...despesa(usuario, conta, categoria),
          direction: 1,
          kind: 'ajuste',
          nature: null,
          category_id: null,
          adjustment_reason: 'estorno',
        })} returning id
      `
      return { original: original.id, estorno: estorno.id }
    })

    await comoUsuario(usuario, (sql) => sql`
      insert into ledger_reversals (user_id, original_transaction_id, reversal_transaction_id, reason)
      values (${usuario}, ${ids.original}, ${ids.estorno}, 'erro de digitação')
    `)

    await expect(
      comoUsuario(usuario, (sql) => sql`
        insert into ledger_reversals (user_id, original_transaction_id, reversal_transaction_id, reason)
        values (${usuario}, ${ids.original}, ${ids.estorno}, 'de novo')
      `),
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test:integration -- 003`
Expected: FAIL — `relation "transactions" does not exist`.

- [ ] **Step 3: Escrever `migrations/003_transactions.sql`**

```sql
-- Up Migration

create type transaction_kind   as enum ('receita', 'despesa', 'transferencia', 'ajuste');
create type transaction_nature as enum ('fixa', 'variavel');
create type transaction_source as enum ('manual', 'importacao', 'integracao', 'ia');

-- Os seis estados gravados. `atrasado` não está aqui: é derivado de
-- vencimento e liquidação. Estado gravado precisaria de um processo
-- periódico para virá-lo, e um processo que falha deixa o dado mentindo.
create type transaction_status as enum (
  'previsto', 'pendente', 'liquidado', 'conciliado', 'cancelado', 'estornado'
);

create table transactions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references users (id) on delete cascade,
  account_id           uuid not null references accounts (id) on delete restrict,
  category_id          uuid references categories (id) on delete restrict,

  kind                 transaction_kind not null,
  nature               transaction_nature,
  description          text not null,
  counterparty         text,
  notes                text,

  amount_cents         bigint not null,
  direction            smallint not null,
  signed_amount_cents  bigint generated always as (amount_cents * direction) stored,

  status               transaction_status not null,
  competence_date      date not null,
  settled_date         date,

  transfer_group_id    uuid,
  adjustment_reason    text,

  source               transaction_source not null default 'manual',
  external_id          text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- O valor é sempre positivo; o efeito contábil vem da direção (§5.3).
  constraint tx_valor_positivo check (amount_cents > 0),
  constraint tx_direcao_valida check (direction in (-1, 1)),
  constraint tx_descricao_nao_vazia check (length(btrim(description)) > 0),

  constraint tx_receita_entra check (kind <> 'receita' or direction = 1),
  constraint tx_despesa_sai   check (kind <> 'despesa' or direction = -1),

  -- Só liquidado e conciliado têm data de liquidação, e ambos exigem uma.
  constraint tx_liquidacao_coerente check (
    (status in ('liquidado', 'conciliado') and settled_date is not null)
    or
    (status not in ('liquidado', 'conciliado') and settled_date is null)
  ),

  -- Natureza fixa ou variável só existe em receita e despesa (§5.3).
  constraint tx_natureza_coerente check (
    (kind in ('receita', 'despesa') and nature is not null)
    or
    (kind not in ('receita', 'despesa') and nature is null)
  ),

  -- Transferência liga dois lados e não é receita nem despesa, então não
  -- leva categoria (§5.3).
  constraint tx_transferencia_tem_grupo check (
    kind <> 'transferencia' or transfer_group_id is not null
  ),
  constraint tx_transferencia_sem_categoria check (
    kind <> 'transferencia' or category_id is null
  ),

  constraint tx_ajuste_tem_motivo check (
    kind <> 'ajuste' or length(btrim(coalesce(adjustment_reason, ''))) > 0
  )
);

-- Reimportar o mesmo extrato não duplica (§5.3). NULL não conflita com
-- NULL no Postgres, então lançamento manual sem origem externa fica livre.
create unique index tx_idempotencia
  on transactions (user_id, source, external_id)
  where external_id is not null;

create index tx_conta_status on transactions (account_id, status);
create index tx_competencia on transactions (user_id, competence_date desc);
create index tx_grupo on transactions (transfer_group_id) where transfer_group_id is not null;

-- Lançamento liquidado ou conciliado não é apagado fisicamente (§5.3).
-- A correção é o estorno, que preserva a trilha.
create or replace function transactions_proibe_delete() returns trigger
language plpgsql as $$
begin
  if old.status in ('liquidado', 'conciliado', 'estornado') then
    raise exception
      'Lançamento % está "%" e não pode ser apagado. Use estorno para corrigir.',
      old.id, old.status
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$$;

create trigger transactions_proibe_delete
  before delete on transactions
  for each row execute function transactions_proibe_delete();

create table ledger_reversals (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references users (id) on delete cascade,
  original_transaction_id  uuid not null references transactions (id) on delete restrict,
  reversal_transaction_id  uuid not null references transactions (id) on delete restrict,
  reason                   text not null,
  created_at               timestamptz not null default now(),

  constraint reversal_nao_estorna_a_si_mesmo
    check (original_transaction_id <> reversal_transaction_id),
  constraint reversal_motivo_nao_vazio check (length(btrim(reason)) > 0)
);

-- Um lançamento é estornado uma vez só.
create unique index reversal_original_unico on ledger_reversals (original_transaction_id);

alter table transactions     enable row level security;
alter table transactions     force  row level security;
alter table ledger_reversals enable row level security;
alter table ledger_reversals force  row level security;

create policy transactions_proprio on transactions
  using (user_id = app_user_id()) with check (user_id = app_user_id());

create policy ledger_reversals_proprio on ledger_reversals
  using (user_id = app_user_id()) with check (user_id = app_user_id());

grant select, insert, update, delete on transactions to money_tree_app;
grant select, insert on ledger_reversals to money_tree_app;

-- Down Migration

drop table if exists ledger_reversals;
drop trigger if exists transactions_proibe_delete on transactions;
drop function if exists transactions_proibe_delete();
drop table if exists transactions;
drop type if exists transaction_status;
drop type if exists transaction_source;
drop type if exists transaction_nature;
drop type if exists transaction_kind;
```

O `delete` está concedido em `transactions` de propósito: o gatilho decide o que pode ser apagado, não o `GRANT`. Lançamento previsto precisa poder sumir quando o usuário usa "desfazer". `ledger_reversals` não tem `update` nem `delete` para ninguém — a trilha de estorno é imutável.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test:integration -- 003`
Expected: PASS — 12 testes.

- [ ] **Step 5: Commit**

```bash
git add migrations/003_transactions.sql tests/integration/003-transactions.test.ts
git commit -m "feat(db): razão de lançamentos com invariantes no banco

Valor sempre positivo, direção amarrada ao tipo, liquidação coerente com
o estado, transferência com grupo e sem categoria, ajuste com motivo.
Gatilho impede apagar liquidado: a correção é estorno. As ameaças T6 e
T11 viram teste.

O campo description entrou aqui: PRODUCT.md §5.3 o exige e a spec o havia
omitido na tabela."
```

---

### Task 10: Migração 004 — conciliação, auditoria, view de saldo e transferência atômica

**Files:**
- Create: `migrations/004_reconciliation_audit.sql`
- Test: `tests/integration/004-saldos-transferencia.test.ts`

**Interfaces:**
- Consumes: tudo das migrações anteriores.
- Produces:
  - tabelas `reconciliations`, `audit_events`;
  - view `account_balances` com colunas `account_id`, `user_id`, `balance_cents`, `is_estimated`;
  - função `create_transfer(p_user_id uuid, p_from_account uuid, p_to_account uuid, p_amount_cents bigint, p_description text, p_competence_date date, p_settled_date date, p_status transaction_status, p_notes text) returns uuid` — devolve o `transfer_group_id`.

- [ ] **Step 1: Escrever o teste que falha**

`tests/integration/004-saldos-transferencia.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { comoUsuario, criarUsuario, limparBanco, sqlAdmin } from './helpers'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

async function duasContas() {
  const usuario = await criarUsuario()
  const contas = await comoUsuario(usuario, (sql) => sql<{ id: string; name: string }[]>`
    insert into accounts (user_id, name, type, initial_balance_cents, initial_balance_date)
    values
      (${usuario}, 'Corrente', 'corrente', 100000, '2026-09-01'),
      (${usuario}, 'Poupança', 'poupanca',  50000, '2026-09-01')
    returning id, name
  `)
  return {
    usuario,
    corrente: contas.find((c) => c.name === 'Corrente')!.id,
    poupanca: contas.find((c) => c.name === 'Poupança')!.id,
  }
}

describe('view account_balances', () => {
  it('sem lançamentos, o saldo é o inicial e é estimado', async () => {
    const { usuario, corrente } = await duasContas()
    const [saldo] = await comoUsuario(usuario, (sql) => sql<
      { balance_cents: string; is_estimated: boolean }[]
    >`select balance_cents, is_estimated from account_balances where account_id = ${corrente}`)

    expect(Number(saldo.balance_cents)).toBe(100000)
    expect(saldo.is_estimated).toBe(true)
  })

  it('soma apenas liquidado e conciliado', async () => {
    const { usuario, corrente } = await duasContas()

    await comoUsuario(usuario, (sql) => sql`
      insert into transactions
        (user_id, account_id, kind, nature, description, amount_cents, direction, status, competence_date, settled_date)
      values
        (${usuario}, ${corrente}, 'despesa', 'variavel', 'Paga',     5000, -1, 'liquidado', '2026-09-10', '2026-09-10'),
        (${usuario}, ${corrente}, 'despesa', 'variavel', 'Prevista', 9900, -1, 'previsto',  '2026-09-20', null)
    `)

    const [saldo] = await comoUsuario(usuario, (sql) => sql<{ balance_cents: string }[]>`
      select balance_cents from account_balances where account_id = ${corrente}
    `)
    expect(Number(saldo.balance_cents)).toBe(95000)
  })

  it('conciliada e sem movimento posterior deixa de ser estimada', async () => {
    const { usuario, corrente } = await duasContas()

    await comoUsuario(usuario, (sql) => sql`
      update accounts set last_reconciled_at = '2026-09-15T00:00:00Z' where id = ${corrente}
    `)

    const [saldo] = await comoUsuario(usuario, (sql) => sql<{ is_estimated: boolean }[]>`
      select is_estimated from account_balances where account_id = ${corrente}
    `)
    expect(saldo.is_estimated).toBe(false)
  })

  it('movimento após a conciliação volta a estimar', async () => {
    const { usuario, corrente } = await duasContas()

    await comoUsuario(usuario, async (sql) => {
      await sql`update accounts set last_reconciled_at = '2026-09-15T00:00:00Z' where id = ${corrente}`
      await sql`
        insert into transactions
          (user_id, account_id, kind, nature, description, amount_cents, direction, status, competence_date, settled_date)
        values (${usuario}, ${corrente}, 'despesa', 'variavel', 'Depois', 100, -1, 'liquidado', '2026-09-20', '2026-09-20')
      `
    })

    const [saldo] = await comoUsuario(usuario, (sql) => sql<{ is_estimated: boolean }[]>`
      select is_estimated from account_balances where account_id = ${corrente}
    `)
    expect(saldo.is_estimated).toBe(true)
  })
})

describe('create_transfer', () => {
  it('cria dois lados vinculados', async () => {
    const { usuario, corrente, poupanca } = await duasContas()

    const lados = await comoUsuario(usuario, async (sql) => {
      await sql`
        select create_transfer(
          ${usuario}, ${corrente}, ${poupanca}, 30000,
          'Guardando', '2026-09-18'::date, '2026-09-18'::date, 'liquidado'::transaction_status, null
        )
      `
      return sql<{ account_id: string; direction: number; transfer_group_id: string }[]>`
        select account_id, direction, transfer_group_id from transactions order by direction
      `
    })

    expect(lados).toHaveLength(2)
    expect(lados[0].direction).toBe(-1)
    expect(lados[0].account_id).toBe(corrente)
    expect(lados[1].direction).toBe(1)
    expect(lados[1].account_id).toBe(poupanca)
    expect(lados[0].transfer_group_id).toBe(lados[1].transfer_group_id)
  })

  it('INVARIANTE: transferência não altera o total', async () => {
    const { usuario, corrente, poupanca } = await duasContas()

    const total = async () => {
      const [linha] = await comoUsuario(usuario, (sql) => sql<{ soma: string }[]>`
        select coalesce(sum(balance_cents), 0) as soma from account_balances
      `)
      return Number(linha.soma)
    }

    const antes = await total()

    await comoUsuario(usuario, (sql) => sql`
      select create_transfer(
        ${usuario}, ${corrente}, ${poupanca}, 30000,
        'Guardando', '2026-09-18'::date, '2026-09-18'::date, 'liquidado'::transaction_status, null
      )
    `)

    expect(await total()).toBe(antes)
  })

  it('AMEAÇA T10: falha em um lado não deixa o outro gravado', async () => {
    const { usuario, corrente } = await duasContas()
    const contaInexistente = crypto.randomUUID()

    await expect(
      comoUsuario(usuario, (sql) => sql`
        select create_transfer(
          ${usuario}, ${corrente}, ${contaInexistente}, 30000,
          'Quebrada', '2026-09-18'::date, '2026-09-18'::date, 'liquidado'::transaction_status, null
        )
      `),
    ).rejects.toThrow()

    const linhas = await comoUsuario(usuario, (sql) => sql`select id from transactions`)
    expect(linhas).toHaveLength(0)
  })

  it('recusa transferência para a mesma conta', async () => {
    const { usuario, corrente } = await duasContas()
    await expect(
      comoUsuario(usuario, (sql) => sql`
        select create_transfer(
          ${usuario}, ${corrente}, ${corrente}, 1000,
          'Círculo', '2026-09-18'::date, '2026-09-18'::date, 'liquidado'::transaction_status, null
        )
      `),
    ).rejects.toThrow(/mesma conta/i)
  })
})

describe('reconciliations e audit_events', () => {
  it('registra a diferença e a decisão', async () => {
    const { usuario, corrente } = await duasContas()

    const [registro] = await comoUsuario(usuario, (sql) => sql<{ difference_cents: string }[]>`
      insert into reconciliations
        (user_id, account_id, reported_balance_cents, calculated_balance_cents, decision)
      values (${usuario}, ${corrente}, 98000, 100000, 'ajuste_criado')
      returning difference_cents
    `)

    expect(Number(registro.difference_cents)).toBe(-2000)
  })

  it('audit_events não tem coluna para valor nem descrição', async () => {
    const colunas = await sqlAdmin<{ column_name: string }[]>`
      select column_name from information_schema.columns where table_name = 'audit_events'
    `
    const nomes = colunas.map((c) => c.column_name)

    for (const proibida of ['amount_cents', 'description', 'value', 'notes', 'counterparty', 'token']) {
      expect(nomes).not.toContain(proibida)
    }
  })

  it('AMEAÇA T7: trilha de auditoria é somente inserção para a aplicação', async () => {
    const privilegios = await sqlAdmin<{ privilege_type: string }[]>`
      select privilege_type from information_schema.role_table_grants
      where grantee = 'money_tree_app' and table_name = 'audit_events'
    `
    expect(privilegios.map((p) => p.privilege_type).sort()).toEqual(['INSERT', 'SELECT'])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test:integration -- 004`
Expected: FAIL — `relation "account_balances" does not exist`.

- [ ] **Step 3: Escrever `migrations/004_reconciliation_audit.sql`**

```sql
-- Up Migration

create type reconciliation_decision as enum (
  'lancamento_localizado', 'duplicidade_removida', 'ajuste_criado', 'adiado'
);

create table reconciliations (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references users (id) on delete cascade,
  account_id                uuid not null references accounts (id) on delete restrict,

  reported_balance_cents    bigint not null,
  reported_at               timestamptz not null default now(),
  -- Congelado no instante da conciliação: o saldo calculado muda depois, e
  -- o registro precisa preservar o que foi comparado.
  calculated_balance_cents  bigint not null,
  difference_cents          bigint generated always as
                              (reported_balance_cents - calculated_balance_cents) stored,

  decision                  reconciliation_decision not null,
  adjustment_transaction_id uuid references transactions (id) on delete restrict,
  note                      text,
  created_at                timestamptz not null default now()
);

create index reconciliations_conta on reconciliations (account_id, reported_at desc);

-- Só o mínimo do §11. Nenhuma coluna aqui pode carregar valor, descrição,
-- estabelecimento, token ou prompt.
create table audit_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users (id) on delete cascade,
  event_type      text not null,
  occurred_at     timestamptz not null default now(),
  actor_ref       text not null,
  object_type     text,
  object_ref      text,
  source          text not null,
  result          text not null,
  error_code      text,
  correlation_id  uuid
);

create index audit_events_usuario_tempo on audit_events (user_id, occurred_at desc);

/*
 * Saldo calculado por conta.
 *
 * Só `liquidado` e `conciliado` movem saldo (§6.1). `previsto` e `pendente`
 * ficam de fora e serão consumidos pelo cálculo de dinheiro livre em fatia
 * futura, como buckets separados — é assim que o §6.2 evita dupla contagem.
 *
 * `is_estimated` cumpre a exigência do §6.1: saldo ainda não conferido com
 * fonte externa precisa se anunciar como estimativa.
 */
create view account_balances as
select
  a.id   as account_id,
  a.user_id,
  a.initial_balance_cents
    + coalesce(sum(t.signed_amount_cents) filter (
        where t.status in ('liquidado', 'conciliado')
      ), 0) as balance_cents,
  (
    a.last_reconciled_at is null
    or exists (
      select 1 from transactions posterior
      where posterior.account_id = a.id
        and posterior.status in ('liquidado', 'conciliado')
        and posterior.settled_date > a.last_reconciled_at::date
    )
  ) as is_estimated
from accounts a
left join transactions t on t.account_id = a.id
group by a.id, a.user_id, a.initial_balance_cents, a.last_reconciled_at;

/*
 * Os dois lados de uma transferência, atômicos (§5.3).
 *
 * SECURITY INVOKER — o padrão — para que a RLS do chamador continue valendo.
 * Uma função SECURITY DEFINER aqui seria um buraco: permitiria mover
 * dinheiro entre contas de outro usuário.
 */
create or replace function create_transfer(
  p_user_id         uuid,
  p_from_account    uuid,
  p_to_account      uuid,
  p_amount_cents    bigint,
  p_description     text,
  p_competence_date date,
  p_settled_date    date,
  p_status          transaction_status,
  p_notes           text
) returns uuid
language plpgsql
as $$
declare
  v_grupo uuid := gen_random_uuid();
begin
  if p_from_account = p_to_account then
    raise exception 'Origem e destino não podem ser a mesma conta'
      using errcode = 'check_violation';
  end if;

  insert into transactions
    (user_id, account_id, kind, description, notes, amount_cents, direction,
     status, competence_date, settled_date, transfer_group_id)
  values
    (p_user_id, p_from_account, 'transferencia', p_description, p_notes,
     p_amount_cents, -1, p_status, p_competence_date, p_settled_date, v_grupo),
    (p_user_id, p_to_account, 'transferencia', p_description, p_notes,
     p_amount_cents, 1, p_status, p_competence_date, p_settled_date, v_grupo);

  return v_grupo;
end;
$$;

alter table reconciliations enable row level security;
alter table reconciliations force  row level security;
alter table audit_events    enable row level security;
alter table audit_events    force  row level security;

create policy reconciliations_proprio on reconciliations
  using (user_id = app_user_id()) with check (user_id = app_user_id());

create policy audit_events_proprio on audit_events
  using (user_id = app_user_id()) with check (user_id = app_user_id());

grant select on account_balances to money_tree_app;
grant select, insert on reconciliations to money_tree_app;
-- Sem UPDATE e sem DELETE: trilha de auditoria que se edita não é trilha.
grant select, insert on audit_events to money_tree_app;
grant execute on function create_transfer(uuid, uuid, uuid, bigint, text, date, date, transaction_status, text)
  to money_tree_app;

-- Down Migration

drop function if exists create_transfer(uuid, uuid, uuid, bigint, text, date, date, transaction_status, text);
drop view if exists account_balances;
drop table if exists audit_events;
drop table if exists reconciliations;
drop type if exists reconciliation_decision;
```

Um detalhe que economiza depuração: o `INSERT` com dois `VALUES` dentro da função é uma única instrução. Se o segundo lado violar qualquer constraint ou chave estrangeira, o comando inteiro falha e nenhuma linha fica — é a atomicidade que o §5.3 exige, sem depender de `BEGIN` explícito.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test:integration -- 004`
Expected: PASS — 10 testes.

- [ ] **Step 5: Rodar a suíte inteira de integração**

Run: `npm run test:integration`
Expected: PASS em tudo. O schema está completo.

- [ ] **Step 6: Commit**

```bash
git add migrations/004_reconciliation_audit.sql tests/integration/004-saldos-transferencia.test.ts
git commit -m "feat(db): conciliação, auditoria, view de saldo e transferência atômica

create_transfer é SECURITY INVOKER de propósito: DEFINER permitiria mover
dinheiro entre contas de outro usuário. audit_events não tem coluna capaz
de guardar valor ou descrição, e a aplicação só pode inserir e ler.
Ameaças T7 e T10 viram teste."
```

---

### Task 11: Camada de dados — cliente, transação por usuário e a prova de que a RLS vale

**Files:**
- Create: `src/data/db.ts`, `src/data/with-user.ts`
- Test: `tests/integration/with-user.test.ts`

**Interfaces:**
- Consumes: nada do domínio.
- Produces:
  - `sql` — instância `postgres.Sql` configurada com `prepare: false`.
  - `comoUsuario<T>(userId: string, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T>`
  - `semUsuario<T>(fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T>` — para login, que acontece antes de existir usuário na sessão.

Todos os repositórios das tarefas seguintes passam por `comoUsuario`. Nenhuma consulta de dado financeiro roda fora dele.

- [ ] **Step 1: Escrever o teste que falha**

`tests/integration/with-user.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, limparBanco, sqlAdmin } from './helpers'
import { comoUsuario, semUsuario } from '../../src/data/with-user'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

describe('comoUsuario', () => {
  it('define app.user_id dentro da transação', async () => {
    const usuario = await criarUsuario()
    const [linha] = await comoUsuario(usuario, (sql) => sql<{ atual: string }[]>`
      select app_user_id()::text as atual
    `)
    expect(linha.atual).toBe(usuario)
  })

  it('a variável não vaza para fora da transação', async () => {
    const usuario = await criarUsuario()
    await comoUsuario(usuario, (sql) => sql`select 1`)

    const [linha] = await semUsuario((sql) => sql<{ atual: string | null }[]>`
      select app_user_id()::text as atual
    `)
    expect(linha.atual).toBeNull()
  })

  it('erro dentro da transação desfaz tudo', async () => {
    const usuario = await criarUsuario()

    await expect(
      comoUsuario(usuario, async (sql) => {
        await sql`
          insert into accounts (user_id, name, type, initial_balance_cents, initial_balance_date)
          values (${usuario}, 'Vai sumir', 'corrente', 0, '2026-09-01')
        `
        throw new Error('falha proposital')
      }),
    ).rejects.toThrow('falha proposital')

    const contas = await comoUsuario(usuario, (sql) => sql`select id from accounts`)
    expect(contas).toHaveLength(0)
  })

  it('AMEAÇA T3: dois usuários em paralelo não se misturam', async () => {
    const usuarioA = await criarUsuario()
    const usuarioB = await criarUsuario()

    const [vistoA, vistoB] = await Promise.all([
      comoUsuario(usuarioA, async (sql) => {
        await sql`
          insert into accounts (user_id, name, type, initial_balance_cents, initial_balance_date)
          values (${usuarioA}, 'A', 'corrente', 100, '2026-09-01')
        `
        return sql<{ name: string }[]>`select name from accounts`
      }),
      comoUsuario(usuarioB, async (sql) => {
        await sql`
          insert into accounts (user_id, name, type, initial_balance_cents, initial_balance_date)
          values (${usuarioB}, 'B', 'corrente', 200, '2026-09-01')
        `
        return sql<{ name: string }[]>`select name from accounts`
      }),
    ])

    expect(vistoA.map((c) => c.name)).toEqual(['A'])
    expect(vistoB.map((c) => c.name)).toEqual(['B'])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test:integration -- with-user`
Expected: FAIL — módulo `src/data/with-user` não encontrado.

- [ ] **Step 3: Escrever `src/data/db.ts`**

```ts
import postgres from 'postgres'

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

if (!url) {
  throw new Error('DATABASE_URL não definida.')
}

/**
 * `prepare: false` não é opcional: o Supavisor em modo transação (porta
 * 6543) não mantém a sessão entre comandos, e prepared statement depende de
 * sessão. Com `prepare: true` a aplicação funciona nos primeiros minutos e
 * depois começa a falhar de forma intermitente, que é o pior modo de falhar.
 */
export const sql = postgres(url, {
  prepare: false,
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  // Sem log de consulta: uma consulta financeira logada é um vazamento (§11).
  onnotice: () => {},
})
```

- [ ] **Step 4: Escrever `src/data/with-user.ts`**

```ts
import type postgres from 'postgres'
import { sql } from './db'

/**
 * Abre uma transação, assume o role da aplicação e declara de quem é a
 * sessão. As policies de RLS leem `app.user_id` e filtram tudo.
 *
 * `set_config(..., true)` limita o efeito à transação: a conexão volta ao
 * pool sem carregar a identidade do usuário anterior. Com `false` ali, um
 * pedido herdaria o usuário do pedido passado — exatamente a falha que a
 * ameaça T3 descreve.
 */
export async function comoUsuario<T>(
  userId: string,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId}, true)`
    return fn(tx)
  })
}

/**
 * Transação sem identidade, para o que acontece antes do login: procurar o
 * usuário pelo e-mail e validar a senha. A RLS bloqueia tudo aqui, então as
 * consultas usadas neste caminho rodam com privilégio elevado e ficam
 * restritas a `src/data/users.ts` e `src/data/sessions.ts`.
 */
export async function semUsuario<T>(
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return sql.begin((tx) => fn(tx))
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm run test:integration -- with-user`
Expected: PASS — 4 testes.

Se o teste de vazamento falhar, quase sempre é `set_config` com `false` no terceiro argumento. `true` significa "só nesta transação" e é o que mantém o pool seguro.

- [ ] **Step 6: Commit**

```bash
git add src/data/db.ts src/data/with-user.ts tests/integration/with-user.test.ts
git commit -m "feat(data): cliente Postgres e transação com identidade

prepare: false é exigência do pooler em modo transação. set_config com
escopo de transação impede que uma conexão devolvida ao pool carregue a
identidade do pedido anterior — a ameaça T3 em forma de teste."
```

---

### Task 12: Repositórios de contas e categorias

**Files:**
- Create: `src/data/accounts.ts`, `src/data/categories.ts`
- Test: `tests/integration/repo-accounts-categories.test.ts`

**Interfaces:**
- Consumes: `comoUsuario` de `src/data/with-user.ts`; `Cents`, `AccountType`, `CategoryKind`, `IsoDate` de `src/domain/types.ts`.
- Produces:
  - `src/data/accounts.ts`: `interface Conta`, `interface ContaComSaldo`, `listarContas(userId, opcoes?)`, `buscarConta(userId, id)`, `criarConta(userId, dados)`, `atualizarConta(userId, id, dados)`, `arquivarConta(userId, id)`, `listarContasComSaldo(userId)`.
  - `src/data/categories.ts`: `interface Categoria`, `listarCategorias(userId, opcoes?)`, `criarCategoria(userId, dados)`, `atualizarCategoria(userId, id, dados)`, `arquivarCategoria(userId, id)`, `semearCategoriasPadrao(userId)`.

Tipos usados nas tarefas seguintes:

```ts
export interface Conta {
  id: string
  name: string
  type: AccountType
  institution: string | null
  initialBalanceCents: Cents
  initialBalanceDate: IsoDate
  isLiquid: boolean
  includeInAvailable: boolean
  includeInNetWorth: boolean
  isArchived: boolean
  lastReconciledAt: Date | null
}

export interface ContaComSaldo extends Conta {
  balanceCents: Cents
  isEstimated: boolean
}

export interface Categoria {
  id: string
  parentId: string | null
  name: string
  kind: CategoryKind
  isArchived: boolean
  isSystem: boolean
  sortOrder: number
}
```

- [ ] **Step 1: Escrever o teste que falha**

`tests/integration/repo-accounts-categories.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, limparBanco, sqlAdmin } from './helpers'
import {
  arquivarConta,
  atualizarConta,
  criarConta,
  listarContas,
  listarContasComSaldo,
} from '../../src/data/accounts'
import { listarCategorias, semearCategoriasPadrao } from '../../src/data/categories'
import { cents } from '../../src/domain/money'
import { isoDate } from '../../src/domain/dates'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

const dadosConta = {
  name: 'Corrente',
  type: 'corrente' as const,
  institution: 'Banco X',
  initialBalanceCents: cents(100_000),
  initialBalanceDate: isoDate('2026-09-01'),
}

describe('repositório de contas', () => {
  it('cria e lê de volta com os tipos certos', async () => {
    const usuario = await criarUsuario()
    const criada = await criarConta(usuario, dadosConta)

    expect(criada.name).toBe('Corrente')
    expect(criada.initialBalanceCents).toBe(100_000)
    expect(typeof criada.initialBalanceCents).toBe('number')
    expect(criada.initialBalanceDate).toBe('2026-09-01')
    expect(criada.includeInAvailable).toBe(true)
  })

  it('cartão nasce fora do saldo disponível', async () => {
    const usuario = await criarUsuario()
    const cartao = await criarConta(usuario, { ...dadosConta, name: 'Cartão', type: 'cartao_credito' })
    expect(cartao.includeInAvailable).toBe(false)
    expect(cartao.isLiquid).toBe(false)
  })

  it('arquivar preserva o registro', async () => {
    const usuario = await criarUsuario()
    const conta = await criarConta(usuario, dadosConta)

    await arquivarConta(usuario, conta.id)

    expect(await listarContas(usuario)).toHaveLength(0)
    expect(await listarContas(usuario, { incluirArquivadas: true })).toHaveLength(1)
  })

  it('atualizar não apaga campo que não foi enviado', async () => {
    const usuario = await criarUsuario()
    const conta = await criarConta(usuario, dadosConta)

    const atualizada = await atualizarConta(usuario, conta.id, { name: 'Conta Principal' })

    expect(atualizada.name).toBe('Conta Principal')
    expect(atualizada.institution).toBe('Banco X')
    expect(atualizada.initialBalanceCents).toBe(100_000)
  })

  it('listarContasComSaldo traz saldo e marca de estimado', async () => {
    const usuario = await criarUsuario()
    await criarConta(usuario, dadosConta)

    const [conta] = await listarContasComSaldo(usuario)
    expect(conta.balanceCents).toBe(100_000)
    expect(conta.isEstimated).toBe(true)
  })

  it('não enxerga conta de outro usuário', async () => {
    const usuarioA = await criarUsuario()
    const usuarioB = await criarUsuario()
    await criarConta(usuarioA, dadosConta)

    expect(await listarContas(usuarioB)).toHaveLength(0)
  })
})

describe('repositório de categorias', () => {
  it('semeia catorze categorias em ordem', async () => {
    const usuario = await criarUsuario()
    await semearCategoriasPadrao(usuario)

    const categorias = await listarCategorias(usuario)
    expect(categorias).toHaveLength(14)
    expect(categorias[0].name).toBe('Moradia')
  })

  it('filtra por tipo', async () => {
    const usuario = await criarUsuario()
    await semearCategoriasPadrao(usuario)

    const receitas = await listarCategorias(usuario, { kind: 'receita' })
    expect(receitas.map((c) => c.name)).toEqual(['Renda'])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test:integration -- repo-accounts`
Expected: FAIL — módulos não encontrados.

- [ ] **Step 3: Escrever `src/data/accounts.ts`**

```ts
import type postgres from 'postgres'
import { comoUsuario } from './with-user'
import { cents } from '../domain/money'
import { isoDate } from '../domain/dates'
import type { AccountType, Cents, IsoDate } from '../domain/types'

export interface Conta {
  id: string
  name: string
  type: AccountType
  institution: string | null
  initialBalanceCents: Cents
  initialBalanceDate: IsoDate
  isLiquid: boolean
  includeInAvailable: boolean
  includeInNetWorth: boolean
  isArchived: boolean
  lastReconciledAt: Date | null
}

export interface ContaComSaldo extends Conta {
  balanceCents: Cents
  isEstimated: boolean
}

export interface NovaConta {
  name: string
  type: AccountType
  institution?: string | null
  initialBalanceCents: Cents
  initialBalanceDate: IsoDate
  isLiquid?: boolean
  includeInAvailable?: boolean
  includeInNetWorth?: boolean
}

/**
 * O driver devolve `bigint` como string para não perder precisão. Converter
 * aqui, num único lugar, evita que um `Number` apareça por acidente lá na
 * frente — ou pior, uma concatenação de strings somando saldos.
 */
function paraConta(linha: Record<string, unknown>): Conta {
  return {
    id: linha.id as string,
    name: linha.name as string,
    type: linha.type as AccountType,
    institution: (linha.institution as string | null) ?? null,
    initialBalanceCents: cents(Number(linha.initial_balance_cents)),
    initialBalanceDate: isoDate(
      linha.initial_balance_date instanceof Date
        ? linha.initial_balance_date.toISOString().slice(0, 10)
        : String(linha.initial_balance_date),
    ),
    isLiquid: linha.is_liquid as boolean,
    includeInAvailable: linha.include_in_available as boolean,
    includeInNetWorth: linha.include_in_net_worth as boolean,
    isArchived: linha.is_archived as boolean,
    lastReconciledAt: (linha.last_reconciled_at as Date | null) ?? null,
  }
}

export async function listarContas(
  userId: string,
  opcoes: { incluirArquivadas?: boolean } = {},
): Promise<Conta[]> {
  const incluirArquivadas = opcoes.incluirArquivadas ?? false

  return comoUsuario(userId, async (sql) => {
    const linhas = await sql`
      select * from accounts
      where ${incluirArquivadas ? sql`true` : sql`not is_archived`}
      order by is_archived, name
    `
    return linhas.map(paraConta)
  })
}

export async function listarContasComSaldo(userId: string): Promise<ContaComSaldo[]> {
  return comoUsuario(userId, async (sql) => {
    const linhas = await sql`
      select a.*, b.balance_cents, b.is_estimated
      from accounts a
      join account_balances b on b.account_id = a.id
      where not a.is_archived
      order by a.name
    `
    return linhas.map((linha) => ({
      ...paraConta(linha),
      balanceCents: cents(Number(linha.balance_cents)),
      isEstimated: linha.is_estimated as boolean,
    }))
  })
}

export async function buscarConta(userId: string, id: string): Promise<Conta | null> {
  return comoUsuario(userId, async (sql) => {
    const [linha] = await sql`select * from accounts where id = ${id}`
    return linha ? paraConta(linha) : null
  })
}

export async function criarConta(userId: string, dados: NovaConta): Promise<Conta> {
  return comoUsuario(userId, async (sql) => {
    const [linha] = await sql`
      insert into accounts (
        user_id, name, type, institution,
        initial_balance_cents, initial_balance_date,
        is_liquid, include_in_available, include_in_net_worth
      ) values (
        ${userId}, ${dados.name}, ${dados.type}, ${dados.institution ?? null},
        ${dados.initialBalanceCents}, ${dados.initialBalanceDate},
        ${dados.isLiquid ?? null}, ${dados.includeInAvailable ?? null},
        ${dados.includeInNetWorth ?? true}
      )
      returning *
    `
    return paraConta(linha)
  })
}

/** Atualização parcial: campo ausente fica como está, não vira nulo. */
export async function atualizarConta(
  userId: string,
  id: string,
  dados: Partial<NovaConta>,
): Promise<Conta> {
  const colunas: Record<string, unknown> = {}
  if (dados.name !== undefined) colunas.name = dados.name
  if (dados.type !== undefined) colunas.type = dados.type
  if (dados.institution !== undefined) colunas.institution = dados.institution
  if (dados.initialBalanceCents !== undefined)
    colunas.initial_balance_cents = dados.initialBalanceCents
  if (dados.initialBalanceDate !== undefined)
    colunas.initial_balance_date = dados.initialBalanceDate
  if (dados.isLiquid !== undefined) colunas.is_liquid = dados.isLiquid
  if (dados.includeInAvailable !== undefined)
    colunas.include_in_available = dados.includeInAvailable
  if (dados.includeInNetWorth !== undefined)
    colunas.include_in_net_worth = dados.includeInNetWorth

  if (Object.keys(colunas).length === 0) {
    const atual = await buscarConta(userId, id)
    if (!atual) throw new Error('Conta não encontrada')
    return atual
  }

  colunas.updated_at = new Date()

  return comoUsuario(userId, async (sql) => {
    const [linha] = await sql`
      update accounts set ${sql(colunas)} where id = ${id} returning *
    `
    if (!linha) throw new Error('Conta não encontrada')
    return paraConta(linha)
  })
}

/** Arquivar nunca apaga histórico (§5.2). */
export async function arquivarConta(userId: string, id: string): Promise<void> {
  await comoUsuario(userId, (sql) => sql`
    update accounts set is_archived = true, updated_at = now() where id = ${id}
  `)
}

export async function marcarConciliada(
  userId: string,
  id: string,
  quando: Date,
  tx?: postgres.TransactionSql,
): Promise<void> {
  const executar = (sql: postgres.TransactionSql) => sql`
    update accounts set last_reconciled_at = ${quando}, updated_at = now() where id = ${id}
  `
  if (tx) {
    await executar(tx)
    return
  }
  await comoUsuario(userId, executar)
}
```

- [ ] **Step 4: Escrever `src/data/categories.ts`**

```ts
import { comoUsuario } from './with-user'
import type { CategoryKind } from '../domain/types'

export interface Categoria {
  id: string
  parentId: string | null
  name: string
  kind: CategoryKind
  isArchived: boolean
  isSystem: boolean
  sortOrder: number
}

export interface NovaCategoria {
  name: string
  kind: CategoryKind
  parentId?: string | null
  sortOrder?: number
}

function paraCategoria(linha: Record<string, unknown>): Categoria {
  return {
    id: linha.id as string,
    parentId: (linha.parent_id as string | null) ?? null,
    name: linha.name as string,
    kind: linha.kind as CategoryKind,
    isArchived: linha.is_archived as boolean,
    isSystem: linha.is_system as boolean,
    sortOrder: linha.sort_order as number,
  }
}

export async function listarCategorias(
  userId: string,
  opcoes: { kind?: CategoryKind; incluirArquivadas?: boolean } = {},
): Promise<Categoria[]> {
  const { kind, incluirArquivadas = false } = opcoes

  return comoUsuario(userId, async (sql) => {
    const linhas = await sql`
      select * from categories
      where ${incluirArquivadas ? sql`true` : sql`not is_archived`}
        and ${kind ? sql`kind = ${kind}` : sql`true`}
      order by sort_order, name
    `
    return linhas.map(paraCategoria)
  })
}

export async function criarCategoria(userId: string, dados: NovaCategoria): Promise<Categoria> {
  return comoUsuario(userId, async (sql) => {
    const [linha] = await sql`
      insert into categories (user_id, name, kind, parent_id, sort_order)
      values (${userId}, ${dados.name}, ${dados.kind}, ${dados.parentId ?? null}, ${dados.sortOrder ?? 999})
      returning *
    `
    return paraCategoria(linha)
  })
}

export async function atualizarCategoria(
  userId: string,
  id: string,
  dados: Partial<NovaCategoria>,
): Promise<Categoria> {
  const colunas: Record<string, unknown> = {}
  if (dados.name !== undefined) colunas.name = dados.name
  if (dados.kind !== undefined) colunas.kind = dados.kind
  if (dados.parentId !== undefined) colunas.parent_id = dados.parentId
  if (dados.sortOrder !== undefined) colunas.sort_order = dados.sortOrder
  colunas.updated_at = new Date()

  return comoUsuario(userId, async (sql) => {
    const [linha] = await sql`update categories set ${sql(colunas)} where id = ${id} returning *`
    if (!linha) throw new Error('Categoria não encontrada')
    return paraCategoria(linha)
  })
}

export async function arquivarCategoria(userId: string, id: string): Promise<void> {
  await comoUsuario(userId, (sql) => sql`
    update categories set is_archived = true, updated_at = now() where id = ${id}
  `)
}

/** As catorze do §5.5, chamadas na criação do usuário. */
export async function semearCategoriasPadrao(userId: string): Promise<void> {
  await comoUsuario(userId, (sql) => sql`select seed_categorias_padrao(${userId})`)
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm run test:integration -- repo-accounts`
Expected: PASS — 8 testes.

- [ ] **Step 6: Commit**

```bash
git add src/data/accounts.ts src/data/categories.ts tests/integration/repo-accounts-categories.test.ts
git commit -m "feat(data): repositórios de contas e categorias

bigint vira número inteiro num único lugar. Atualização parcial não
transforma campo ausente em nulo — formulário que envia um campo não
apaga os outros."
```

---

### Task 13: Repositório de lançamentos, com transferência e estorno

**Files:**
- Create: `src/data/transactions.ts`
- Test: `tests/integration/repo-transactions.test.ts`

**Interfaces:**
- Consumes: `comoUsuario`; `validarLancamento`, `direcaoPara`, `assertTransicao`, `MOVEM_SALDO` de `src/domain/transaction.ts`; `cents` de `money.ts`; `isoDate` de `dates.ts`.
- Produces:
  - `interface Lancamento`, `interface NovoLancamento`, `interface FiltroLancamentos`
  - `listarLancamentos(userId, filtro): Promise<{ itens: Lancamento[]; total: number }>`
  - `buscarLancamento(userId, id): Promise<Lancamento | null>`
  - `criarLancamento(userId, dados): Promise<Lancamento>`
  - `atualizarStatus(userId, id, novoStatus, settledDate): Promise<Lancamento>`
  - `apagarLancamentoPrevisto(userId, id): Promise<void>`
  - `criarTransferencia(userId, dados): Promise<string>`
  - `estornarLancamento(userId, id, motivo): Promise<Lancamento>`

- [ ] **Step 1: Escrever o teste que falha**

`tests/integration/repo-transactions.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, limparBanco, sqlAdmin } from './helpers'
import { criarConta, listarContasComSaldo } from '../../src/data/accounts'
import { criarCategoria } from '../../src/data/categories'
import {
  apagarLancamentoPrevisto,
  atualizarStatus,
  criarLancamento,
  criarTransferencia,
  estornarLancamento,
  listarLancamentos,
} from '../../src/data/transactions'
import { isoDate } from '../../src/domain/dates'
import { cents } from '../../src/domain/money'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

async function cenario() {
  const usuario = await criarUsuario()
  const corrente = await criarConta(usuario, {
    name: 'Corrente',
    type: 'corrente',
    initialBalanceCents: cents(100_000),
    initialBalanceDate: isoDate('2026-09-01'),
  })
  const poupanca = await criarConta(usuario, {
    name: 'Poupança',
    type: 'poupanca',
    initialBalanceCents: cents(0),
    initialBalanceDate: isoDate('2026-09-01'),
  })
  const categoria = await criarCategoria(usuario, { name: 'Mercado', kind: 'despesa' })
  return { usuario, corrente, poupanca, categoria }
}

const despesaBase = {
  kind: 'despesa' as const,
  nature: 'variavel' as const,
  description: 'Compra no mercado',
  amountCents: cents(5_000),
  status: 'liquidado' as const,
  competenceDate: isoDate('2026-09-18'),
  settledDate: isoDate('2026-09-18'),
}

describe('criarLancamento', () => {
  it('grava despesa e reduz o saldo', async () => {
    const { usuario, corrente, categoria } = await cenario()

    const lancamento = await criarLancamento(usuario, {
      ...despesaBase,
      accountId: corrente.id,
      categoryId: categoria.id,
    })

    expect(lancamento.direction).toBe(-1)
    expect(lancamento.signedAmountCents).toBe(-5_000)

    const [conta] = await listarContasComSaldo(usuario)
    expect(conta.balanceCents).toBe(95_000)
  })

  it('previsto não mexe no saldo', async () => {
    const { usuario, corrente, categoria } = await cenario()

    await criarLancamento(usuario, {
      ...despesaBase,
      status: 'previsto',
      settledDate: null,
      accountId: corrente.id,
      categoryId: categoria.id,
    })

    const contas = await listarContasComSaldo(usuario)
    expect(contas.find((c) => c.id === corrente.id)?.balanceCents).toBe(100_000)
  })

  it('rejeita antes de tocar no banco quando a invariante do domínio falha', async () => {
    const { usuario, corrente, categoria } = await cenario()

    await expect(
      criarLancamento(usuario, {
        ...despesaBase,
        amountCents: cents(-1),
        accountId: corrente.id,
        categoryId: categoria.id,
      }),
    ).rejects.toThrow(/positivo/i)
  })
})

describe('listarLancamentos', () => {
  it('filtra por conta, período e status, e devolve o total', async () => {
    const { usuario, corrente, poupanca, categoria } = await cenario()

    await criarLancamento(usuario, { ...despesaBase, accountId: corrente.id, categoryId: categoria.id })
    await criarLancamento(usuario, {
      ...despesaBase,
      description: 'Outra',
      competenceDate: isoDate('2026-08-10'),
      settledDate: isoDate('2026-08-10'),
      accountId: corrente.id,
      categoryId: categoria.id,
    })
    await criarLancamento(usuario, {
      ...despesaBase,
      description: 'Na poupança',
      accountId: poupanca.id,
      categoryId: categoria.id,
    })

    const setembroCorrente = await listarLancamentos(usuario, {
      accountId: corrente.id,
      de: isoDate('2026-09-01'),
      ate: isoDate('2026-09-30'),
    })

    expect(setembroCorrente.total).toBe(1)
    expect(setembroCorrente.itens[0].description).toBe('Compra no mercado')
  })

  it('pagina sem perder a contagem total', async () => {
    const { usuario, corrente, categoria } = await cenario()

    for (let i = 0; i < 5; i++) {
      await criarLancamento(usuario, {
        ...despesaBase,
        description: `Compra ${i}`,
        accountId: corrente.id,
        categoryId: categoria.id,
      })
    }

    const pagina = await listarLancamentos(usuario, { limite: 2, deslocamento: 0 })
    expect(pagina.itens).toHaveLength(2)
    expect(pagina.total).toBe(5)
  })
})

describe('transferência', () => {
  it('cria dois lados e não altera o total', async () => {
    const { usuario, corrente, poupanca } = await cenario()

    const totalAntes = (await listarContasComSaldo(usuario)).reduce(
      (soma, c) => soma + c.balanceCents,
      0,
    )

    await criarTransferencia(usuario, {
      fromAccountId: corrente.id,
      toAccountId: poupanca.id,
      amountCents: cents(30_000),
      description: 'Guardando',
      competenceDate: isoDate('2026-09-18'),
      settledDate: isoDate('2026-09-18'),
      status: 'liquidado',
    })

    const contas = await listarContasComSaldo(usuario)
    expect(contas.reduce((soma, c) => soma + c.balanceCents, 0)).toBe(totalAntes)
    expect(contas.find((c) => c.id === corrente.id)?.balanceCents).toBe(70_000)
    expect(contas.find((c) => c.id === poupanca.id)?.balanceCents).toBe(30_000)
  })
})

describe('estorno e exclusão', () => {
  it('estorno marca o original e cria a linha oposta', async () => {
    const { usuario, corrente, categoria } = await cenario()
    const original = await criarLancamento(usuario, {
      ...despesaBase,
      accountId: corrente.id,
      categoryId: categoria.id,
    })

    const estorno = await estornarLancamento(usuario, original.id, 'valor digitado errado')

    expect(estorno.direction).toBe(1)
    expect(estorno.kind).toBe('ajuste')

    const [conta] = await listarContasComSaldo(usuario)
    expect(conta.balanceCents).toBe(100_000)

    const { itens } = await listarLancamentos(usuario, {})
    expect(itens.find((i) => i.id === original.id)?.status).toBe('estornado')
  })

  it('estornar duas vezes é rejeitado', async () => {
    const { usuario, corrente, categoria } = await cenario()
    const original = await criarLancamento(usuario, {
      ...despesaBase,
      accountId: corrente.id,
      categoryId: categoria.id,
    })

    await estornarLancamento(usuario, original.id, 'primeira vez')
    await expect(estornarLancamento(usuario, original.id, 'segunda')).rejects.toThrow()
  })

  it('desfazer apaga previsto e recusa liquidado', async () => {
    const { usuario, corrente, categoria } = await cenario()

    const previsto = await criarLancamento(usuario, {
      ...despesaBase,
      status: 'previsto',
      settledDate: null,
      accountId: corrente.id,
      categoryId: categoria.id,
    })
    await apagarLancamentoPrevisto(usuario, previsto.id)

    const liquidado = await criarLancamento(usuario, {
      ...despesaBase,
      accountId: corrente.id,
      categoryId: categoria.id,
    })
    await expect(apagarLancamentoPrevisto(usuario, liquidado.id)).rejects.toThrow(/estorno/i)
  })

  it('atualizarStatus respeita a máquina de estados', async () => {
    const { usuario, corrente, categoria } = await cenario()
    const liquidado = await criarLancamento(usuario, {
      ...despesaBase,
      accountId: corrente.id,
      categoryId: categoria.id,
    })

    await expect(atualizarStatus(usuario, liquidado.id, 'cancelado', null)).rejects.toThrow(
      /Transição proibida/,
    )

    const conciliado = await atualizarStatus(
      usuario,
      liquidado.id,
      'conciliado',
      isoDate('2026-09-18'),
    )
    expect(conciliado.status).toBe('conciliado')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test:integration -- repo-transactions`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Escrever `src/data/transactions.ts`**

```ts
import { comoUsuario } from './with-user'
import { isoDate } from '../domain/dates'
import { cents } from '../domain/money'
import { assertTransicao, direcaoPara, validarLancamento } from '../domain/transaction'
import type {
  Cents,
  IsoDate,
  TransactionKind,
  TransactionNature,
  TransactionSource,
  TransactionStatus,
} from '../domain/types'

export interface Lancamento {
  id: string
  accountId: string
  categoryId: string | null
  kind: TransactionKind
  nature: TransactionNature | null
  description: string
  counterparty: string | null
  notes: string | null
  amountCents: Cents
  direction: -1 | 1
  signedAmountCents: Cents
  status: TransactionStatus
  competenceDate: IsoDate
  settledDate: IsoDate | null
  transferGroupId: string | null
  adjustmentReason: string | null
  source: TransactionSource
  createdAt: Date
}

export interface NovoLancamento {
  accountId: string
  categoryId?: string | null
  kind: TransactionKind
  nature?: TransactionNature | null
  description: string
  counterparty?: string | null
  notes?: string | null
  amountCents: Cents
  direction?: -1 | 1
  status: TransactionStatus
  competenceDate: IsoDate
  settledDate?: IsoDate | null
  adjustmentReason?: string | null
  source?: TransactionSource
  externalId?: string | null
}

export interface FiltroLancamentos {
  accountId?: string
  categoryId?: string
  status?: TransactionStatus
  de?: IsoDate
  ate?: IsoDate
  limite?: number
  deslocamento?: number
}

function dataOuNulo(valor: unknown): IsoDate | null {
  if (valor === null || valor === undefined) return null
  return isoDate(valor instanceof Date ? valor.toISOString().slice(0, 10) : String(valor))
}

function paraLancamento(linha: Record<string, unknown>): Lancamento {
  return {
    id: linha.id as string,
    accountId: linha.account_id as string,
    categoryId: (linha.category_id as string | null) ?? null,
    kind: linha.kind as TransactionKind,
    nature: (linha.nature as TransactionNature | null) ?? null,
    description: linha.description as string,
    counterparty: (linha.counterparty as string | null) ?? null,
    notes: (linha.notes as string | null) ?? null,
    amountCents: cents(Number(linha.amount_cents)),
    direction: Number(linha.direction) as -1 | 1,
    signedAmountCents: cents(Number(linha.signed_amount_cents)),
    status: linha.status as TransactionStatus,
    competenceDate: dataOuNulo(linha.competence_date)!,
    settledDate: dataOuNulo(linha.settled_date),
    transferGroupId: (linha.transfer_group_id as string | null) ?? null,
    adjustmentReason: (linha.adjustment_reason as string | null) ?? null,
    source: linha.source as TransactionSource,
    createdAt: linha.created_at as Date,
  }
}

export async function criarLancamento(
  userId: string,
  dados: NovoLancamento,
): Promise<Lancamento> {
  const direction = direcaoPara(dados.kind, dados.direction)

  // Falha aqui é falha barata: mensagem legível, sem ida ao banco. As mesmas
  // regras existem como CHECK, que é o que garante a invariante de verdade.
  validarLancamento({
    kind: dados.kind,
    amountCents: dados.amountCents,
    direction,
    status: dados.status,
    competenceDate: dados.competenceDate,
    settledDate: dados.settledDate ?? null,
    nature: dados.nature ?? null,
    categoryId: dados.categoryId ?? null,
    transferGroupId: null,
    adjustmentReason: dados.adjustmentReason ?? null,
  })

  return comoUsuario(userId, async (sql) => {
    const [linha] = await sql`
      insert into transactions (
        user_id, account_id, category_id, kind, nature, description, counterparty, notes,
        amount_cents, direction, status, competence_date, settled_date,
        adjustment_reason, source, external_id
      ) values (
        ${userId}, ${dados.accountId}, ${dados.categoryId ?? null}, ${dados.kind},
        ${dados.nature ?? null}, ${dados.description}, ${dados.counterparty ?? null},
        ${dados.notes ?? null}, ${dados.amountCents}, ${direction}, ${dados.status},
        ${dados.competenceDate}, ${dados.settledDate ?? null},
        ${dados.adjustmentReason ?? null}, ${dados.source ?? 'manual'}, ${dados.externalId ?? null}
      )
      returning *
    `
    return paraLancamento(linha)
  })
}

export async function buscarLancamento(userId: string, id: string): Promise<Lancamento | null> {
  return comoUsuario(userId, async (sql) => {
    const [linha] = await sql`select * from transactions where id = ${id}`
    return linha ? paraLancamento(linha) : null
  })
}

export async function listarLancamentos(
  userId: string,
  filtro: FiltroLancamentos,
): Promise<{ itens: Lancamento[]; total: number }> {
  const limite = Math.min(filtro.limite ?? 50, 200)
  const deslocamento = filtro.deslocamento ?? 0

  return comoUsuario(userId, async (sql) => {
    const onde = sql`
      where ${filtro.accountId ? sql`account_id = ${filtro.accountId}` : sql`true`}
        and ${filtro.categoryId ? sql`category_id = ${filtro.categoryId}` : sql`true`}
        and ${filtro.status ? sql`status = ${filtro.status}` : sql`true`}
        and ${filtro.de ? sql`competence_date >= ${filtro.de}` : sql`true`}
        and ${filtro.ate ? sql`competence_date <= ${filtro.ate}` : sql`true`}
    `

    const linhas = await sql`
      select * from transactions ${onde}
      order by competence_date desc, created_at desc
      limit ${limite} offset ${deslocamento}
    `
    const [contagem] = await sql<{ total: string }[]>`
      select count(*)::text as total from transactions ${onde}
    `

    return { itens: linhas.map(paraLancamento), total: Number(contagem.total) }
  })
}

export async function atualizarStatus(
  userId: string,
  id: string,
  novoStatus: TransactionStatus,
  settledDate: IsoDate | null,
): Promise<Lancamento> {
  const atual = await buscarLancamento(userId, id)
  if (!atual) throw new Error('Lançamento não encontrado')

  assertTransicao(atual.status, novoStatus)

  return comoUsuario(userId, async (sql) => {
    const [linha] = await sql`
      update transactions
      set status = ${novoStatus}, settled_date = ${settledDate}, updated_at = now()
      where id = ${id}
      returning *
    `
    return paraLancamento(linha)
  })
}

/**
 * O "desfazer" do aviso de criação. O gatilho do banco recusa apagar
 * liquidado, conciliado ou estornado — ali a regra é definitiva.
 */
export async function apagarLancamentoPrevisto(userId: string, id: string): Promise<void> {
  await comoUsuario(userId, (sql) => sql`delete from transactions where id = ${id}`)
}

export interface NovaTransferencia {
  fromAccountId: string
  toAccountId: string
  amountCents: Cents
  description: string
  competenceDate: IsoDate
  settledDate: IsoDate | null
  status: TransactionStatus
  notes?: string | null
}

/** Os dois lados numa única instrução. Ver `create_transfer` na migração 004. */
export async function criarTransferencia(
  userId: string,
  dados: NovaTransferencia,
): Promise<string> {
  return comoUsuario(userId, async (sql) => {
    const [linha] = await sql<{ create_transfer: string }[]>`
      select create_transfer(
        ${userId}, ${dados.fromAccountId}, ${dados.toAccountId}, ${dados.amountCents},
        ${dados.description}, ${dados.competenceDate}::date, ${dados.settledDate},
        ${dados.status}::transaction_status, ${dados.notes ?? null}
      )
    `
    return linha.create_transfer
  })
}

/**
 * Estorno: o original passa a `estornado` e deixa de contar; uma linha nova,
 * de sinal oposto, entra liquidada; o vínculo entre as duas fica em
 * `ledger_reversals`, que é imutável. Tudo numa transação — meio estorno é
 * pior do que nenhum.
 */
export async function estornarLancamento(
  userId: string,
  id: string,
  motivo: string,
): Promise<Lancamento> {
  if (!motivo.trim()) {
    throw new Error('Estorno exige motivo')
  }

  const original = await buscarLancamento(userId, id)
  if (!original) throw new Error('Lançamento não encontrado')

  assertTransicao(original.status, 'estornado')

  return comoUsuario(userId, async (sql) => {
    const [estorno] = await sql`
      insert into transactions (
        user_id, account_id, kind, description, amount_cents, direction,
        status, competence_date, settled_date, adjustment_reason, source
      ) values (
        ${userId}, ${original.accountId}, 'ajuste',
        ${`Estorno: ${original.description}`}, ${original.amountCents},
        ${original.direction * -1}, 'liquidado',
        ${original.competenceDate}, ${original.settledDate ?? original.competenceDate},
        ${motivo}, 'manual'
      )
      returning *
    `

    await sql`
      update transactions set status = 'estornado', updated_at = now() where id = ${id}
    `

    await sql`
      insert into ledger_reversals (user_id, original_transaction_id, reversal_transaction_id, reason)
      values (${userId}, ${id}, ${estorno.id}, ${motivo})
    `

    return paraLancamento(estorno)
  })
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test:integration -- repo-transactions`
Expected: PASS — 9 testes.

Um detalhe que pode surpreender: o `update` que marca o original como `estornado` precisa vir **depois** da inserção do estorno, porque a constraint `tx_liquidacao_coerente` não permite `estornado` com `settled_date` preenchida. Confira a ordem se o teste reclamar de constraint.

- [ ] **Step 5: Ajustar a constraint, se necessário**

Se o teste de estorno falhar com `tx_liquidacao_coerente`, o original liquidado não pode virar `estornado` mantendo `settled_date`. Corrija a migração 003 trocando a constraint por:

```sql
  constraint tx_liquidacao_coerente check (
    (status in ('liquidado', 'conciliado') and settled_date is not null)
    or
    (status in ('previsto', 'pendente', 'cancelado') and settled_date is null)
    or
    -- Estornado preserva a data de quando foi liquidado: apagá-la perderia
    -- a informação de quando o dinheiro de fato saiu.
    (status = 'estornado')
  )
```

Crie isso como `migrations/005_ajusta_liquidacao_estornado.sql` em vez de editar a 003 — migração aplicada não se reescreve.

- [ ] **Step 6: Commit**

```bash
git add src/data/transactions.ts tests/integration/repo-transactions.test.ts migrations/
git commit -m "feat(data): lançamentos, transferência e estorno

Estorno numa transação só: original vira estornado, linha oposta entra
liquidada, vínculo imutável em ledger_reversals. atualizarStatus passa
pela máquina de estados do domínio antes de tocar no banco."
```

---

### Task 14: Repositório de conciliação

**Files:**
- Create: `src/data/reconciliations.ts`
- Test: `tests/integration/repo-reconciliation.test.ts`

**Interfaces:**
- Consumes: `comoUsuario`; `conciliar` de `src/domain/reconciliation.ts`; `marcarConciliada` de `src/data/accounts.ts`; `criarLancamento` de `src/data/transactions.ts`.
- Produces:
  - `prepararConciliacao(userId, accountId, reportedCents): Promise<{ calculatedCents: Cents; differenceCents: Cents; confere: boolean; decisoesPossiveis: DecisaoConciliacao[] }>`
  - `registrarConciliacao(userId, dados): Promise<{ reconciliationId: string; adjustmentTransactionId: string | null }>`

- [ ] **Step 1: Escrever o teste que falha**

`tests/integration/repo-reconciliation.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, limparBanco, sqlAdmin } from './helpers'
import { criarConta, listarContasComSaldo } from '../../src/data/accounts'
import { prepararConciliacao, registrarConciliacao } from '../../src/data/reconciliations'
import { isoDate } from '../../src/domain/dates'
import { cents } from '../../src/domain/money'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

async function conta() {
  const usuario = await criarUsuario()
  const corrente = await criarConta(usuario, {
    name: 'Corrente',
    type: 'corrente',
    initialBalanceCents: cents(100_000),
    initialBalanceDate: isoDate('2026-09-01'),
  })
  return { usuario, corrente }
}

describe('prepararConciliacao', () => {
  it('calcula a diferença sem gravar nada', async () => {
    const { usuario, corrente } = await conta()

    const previa = await prepararConciliacao(usuario, corrente.id, cents(98_000))

    expect(previa.calculatedCents).toBe(100_000)
    expect(previa.differenceCents).toBe(-2_000)
    expect(previa.confere).toBe(false)
    expect(previa.decisoesPossiveis[0]).toBe('lancamento_localizado')

    const [depois] = await listarContasComSaldo(usuario)
    expect(depois.balanceCents).toBe(100_000)
    expect(depois.isEstimated).toBe(true)
  })
})

describe('registrarConciliacao', () => {
  it('sem diferença, apenas marca a conta como conciliada', async () => {
    const { usuario, corrente } = await conta()

    const resultado = await registrarConciliacao(usuario, {
      accountId: corrente.id,
      reportedCents: cents(100_000),
      decision: 'adiado',
      quando: isoDate('2026-09-18'),
    })

    expect(resultado.adjustmentTransactionId).toBeNull()

    const [depois] = await listarContasComSaldo(usuario)
    expect(depois.isEstimated).toBe(false)
  })

  it('com ajuste, cria o lançamento e o saldo passa a bater', async () => {
    const { usuario, corrente } = await conta()

    const resultado = await registrarConciliacao(usuario, {
      accountId: corrente.id,
      reportedCents: cents(98_000),
      decision: 'ajuste_criado',
      motivo: 'tarifa não lançada',
      quando: isoDate('2026-09-18'),
    })

    expect(resultado.adjustmentTransactionId).not.toBeNull()

    const [depois] = await listarContasComSaldo(usuario)
    expect(depois.balanceCents).toBe(98_000)
    expect(depois.isEstimated).toBe(false)
  })

  it('ajuste sem motivo é recusado, como manda o §5.3.1', async () => {
    const { usuario, corrente } = await conta()

    await expect(
      registrarConciliacao(usuario, {
        accountId: corrente.id,
        reportedCents: cents(98_000),
        decision: 'ajuste_criado',
        quando: isoDate('2026-09-18'),
      }),
    ).rejects.toThrow(/motivo/i)
  })

  it('adiar com diferença não cria ajuste nem esconde a divergência', async () => {
    const { usuario, corrente } = await conta()

    const resultado = await registrarConciliacao(usuario, {
      accountId: corrente.id,
      reportedCents: cents(98_000),
      decision: 'adiado',
      quando: isoDate('2026-09-18'),
    })

    expect(resultado.adjustmentTransactionId).toBeNull()

    const [depois] = await listarContasComSaldo(usuario)
    expect(depois.balanceCents).toBe(100_000)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test:integration -- repo-reconciliation`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Escrever `src/data/reconciliations.ts`**

```ts
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

async function saldoCalculado(userId: string, accountId: string): Promise<Cents> {
  return comoUsuario(userId, async (sql) => {
    const [linha] = await sql<{ balance_cents: string }[]>`
      select balance_cents from account_balances where account_id = ${accountId}
    `
    if (!linha) throw new Error('Conta não encontrada')
    return cents(Number(linha.balance_cents))
  })
}

/** Só calcula e oferece. Nada é gravado até o usuário decidir (§5.3.1). */
export async function prepararConciliacao(
  userId: string,
  accountId: string,
  reportedCents: Cents,
): Promise<PreviaConciliacao> {
  const calculatedCents = await saldoCalculado(userId, accountId)
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
 * A conta é marcada como conciliada em qualquer decisão — inclusive
 * `adiado`, porque o usuário conferiu. A diferença continua registrada e
 * visível; adiar não é esconder.
 */
export async function registrarConciliacao(
  userId: string,
  dados: RegistroConciliacao,
): Promise<{ reconciliationId: string; adjustmentTransactionId: string | null }> {
  const calculatedCents = await saldoCalculado(userId, dados.accountId)
  const { differenceCents } = conciliar(dados.reportedCents, calculatedCents)

  if (dados.decision === 'ajuste_criado' && !dados.motivo?.trim()) {
    throw new Error('Ajuste de saldo exige motivo registrado')
  }

  return comoUsuario(userId, async (sql) => {
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

    await sql`
      update accounts set last_reconciled_at = now(), updated_at = now()
      where id = ${dados.accountId}
    `

    return { reconciliationId: registro.id, adjustmentTransactionId }
  })
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test:integration -- repo-reconciliation`
Expected: PASS — 5 testes.

- [ ] **Step 5: Commit**

```bash
git add src/data/reconciliations.ts tests/integration/repo-reconciliation.test.ts
git commit -m "feat(data): prévia e registro de conciliação

Preparar não grava nada. Ajuste exige motivo. Adiar registra a
divergência em vez de escondê-la."
```

---

### Task 15: Logger com redação e trilha de auditoria

**Files:**
- Create: `src/lib/logger.ts`, `src/data/audit.ts`
- Test: `tests/unit/logger.test.ts`, `tests/integration/audit.test.ts`

**Interfaces:**
- Consumes: `comoUsuario`.
- Produces:
  - `src/lib/logger.ts`: `redigir(valor: unknown): unknown`, `log.info(evento, contexto?)`, `log.warn(...)`, `log.error(...)`.
  - `src/data/audit.ts`: `type EventoAuditoria`, `registrarEvento(userId, evento): Promise<void>`.

Esta tarefa existe antes da autenticação de propósito: a primeira coisa que o login faz é registrar um evento, e é melhor que o redator já esteja pronto do que ser adicionado depois, quando algumas senhas já passaram pelo console.

- [ ] **Step 1: Escrever o teste unitário que falha**

`tests/unit/logger.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { redigir } from '../../src/lib/logger'

describe('redigir', () => {
  it('apaga chaves sensíveis em qualquer profundidade', () => {
    const entrada = {
      userId: 'abc',
      password: 'segredo',
      token: 'xyz',
      amountCents: 12345,
      description: 'Farmácia da esquina',
      nested: { password_hash: 'h', counterparty: 'Padaria', notes: 'anotação' },
    }

    expect(redigir(entrada)).toEqual({
      userId: 'abc',
      password: '[redigido]',
      token: '[redigido]',
      amountCents: '[redigido]',
      description: '[redigido]',
      nested: {
        password_hash: '[redigido]',
        counterparty: '[redigido]',
        notes: '[redigido]',
      },
    })
  })

  it('atravessa listas', () => {
    expect(redigir([{ amountCents: 1 }, { ok: 2 }])).toEqual([
      { amountCents: '[redigido]' },
      { ok: 2 },
    ])
  })

  it('não quebra com valor primitivo nem nulo', () => {
    expect(redigir('texto')).toBe('texto')
    expect(redigir(null)).toBe(null)
    expect(redigir(42)).toBe(42)
  })

  it('não entra em laço infinito com referência circular', () => {
    const circular: Record<string, unknown> = { ok: 1 }
    circular.self = circular
    expect(() => redigir(circular)).not.toThrow()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- logger`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Escrever `src/lib/logger.ts`**

```ts
/**
 * Chaves que nunca vão para log. A lista cobre credenciais e todo campo
 * capaz de carregar informação financeira: valor, descrição, estabelecimento
 * e observação identificam a vida do usuário tão bem quanto o saldo (§11).
 */
const PROIBIDAS = new Set([
  'password',
  'password_hash',
  'passwordhash',
  'token',
  'token_hash',
  'tokenhash',
  'secret',
  'authorization',
  'cookie',
  'databaseurl',
  'database_url',
  'amount',
  'amountcents',
  'amount_cents',
  'signedamountcents',
  'signed_amount_cents',
  'balance',
  'balancecents',
  'balance_cents',
  'description',
  'counterparty',
  'notes',
  'note',
  'institution',
  'email',
  'prompt',
])

const MARCA = '[redigido]'

export function redigir(valor: unknown, vistos = new WeakSet<object>()): unknown {
  if (valor === null || typeof valor !== 'object') return valor

  if (vistos.has(valor)) return '[circular]'
  vistos.add(valor)

  if (Array.isArray(valor)) {
    return valor.map((item) => redigir(item, vistos))
  }

  const saida: Record<string, unknown> = {}
  for (const [chave, conteudo] of Object.entries(valor)) {
    saida[chave] = PROIBIDAS.has(chave.toLowerCase())
      ? MARCA
      : redigir(conteudo, vistos)
  }
  return saida
}

type Nivel = 'info' | 'warn' | 'error'

function emitir(nivel: Nivel, evento: string, contexto?: Record<string, unknown>) {
  const linha = {
    nivel,
    evento,
    em: new Date().toISOString(),
    ...(contexto ? { contexto: redigir(contexto) } : {}),
  }
  console[nivel === 'warn' ? 'warn' : nivel === 'error' ? 'error' : 'log'](JSON.stringify(linha))
}

export const log = {
  info: (evento: string, contexto?: Record<string, unknown>) => emitir('info', evento, contexto),
  warn: (evento: string, contexto?: Record<string, unknown>) => emitir('warn', evento, contexto),
  error: (evento: string, contexto?: Record<string, unknown>) => emitir('error', evento, contexto),
}
```

- [ ] **Step 4: Escrever `src/data/audit.ts`**

```ts
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
```

- [ ] **Step 5: Escrever o teste de integração da auditoria**

`tests/integration/audit.test.ts`:

```ts
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
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npm test -- logger` e depois `npm run test:integration -- audit`
Expected: PASS — 4 unitários e 3 de integração.

- [ ] **Step 7: Commit**

```bash
git add src/lib/logger.ts src/data/audit.ts tests/unit/logger.test.ts tests/integration/audit.test.ts
git commit -m "feat(obs): logger com redação e trilha de auditoria pseudônima

A lista de chaves proibidas cobre credenciais e todo campo financeiro:
valor, descrição, estabelecimento e observação identificam a vida do
usuário tão bem quanto o saldo. A trilha não tem coluna capaz de guardar
esses dados — a omissão é estrutural."
```

---

### Task 16: Autenticação, sessão e bloqueio por inatividade

**Files:**
- Create: `src/data/users.ts`, `src/data/sessions.ts`, `src/lib/session.ts`
- Test: `tests/integration/auth.test.ts`

**Interfaces:**
- Consumes: `semUsuario`, `comoUsuario`, `registrarEvento`, `semearCategoriasPadrao`.
- Produces:
  - `src/data/users.ts`: `interface Usuario`, `criarUsuarioComSenha(dados)`, `buscarUsuarioPorEmail(email)`, `verificarSenha(email, senha)`, `buscarUsuario(id)`, `atualizarPreferencias(userId, dados)`.
  - `src/data/sessions.ts`: `abrirSessao(userId, contexto)`, `validarSessao(token)`, `encerrarSessao(token)`, `encerrarTodasSessoes(userId)`.
  - `src/lib/session.ts`: `definirCookieSessao(token, expiraEm)`, `lerCookieSessao()`, `limparCookieSessao()`, `usuarioAtual()`, `exigirUsuario()`.

- [ ] **Step 1: Escrever o teste que falha**

`tests/integration/auth.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { limparBanco, sqlAdmin } from './helpers'
import { criarUsuarioComSenha, verificarSenha } from '../../src/data/users'
import { abrirSessao, encerrarSessao, validarSessao } from '../../src/data/sessions'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

const conta = { email: 'pessoa@exemplo.com', senha: 'senha-longa-de-teste-123', nome: 'Pessoa' }

describe('usuários', () => {
  it('nunca guarda a senha em claro', async () => {
    const usuario = await criarUsuarioComSenha(conta)

    const [linha] = await sqlAdmin<{ password_hash: string }[]>`
      select password_hash from users where id = ${usuario.id}
    `
    expect(linha.password_hash).not.toContain(conta.senha)
    expect(linha.password_hash.startsWith('$argon2')).toBe(true)
  })

  it('semeia as catorze categorias na criação', async () => {
    const usuario = await criarUsuarioComSenha(conta)
    const [contagem] = await sqlAdmin<{ total: string }[]>`
      select count(*)::text as total from categories where user_id = ${usuario.id}
    `
    expect(Number(contagem.total)).toBe(14)
  })

  it('aceita a senha certa e recusa a errada', async () => {
    await criarUsuarioComSenha(conta)

    expect(await verificarSenha(conta.email, conta.senha)).not.toBeNull()
    expect(await verificarSenha(conta.email, 'errada')).toBeNull()
  })

  it('e-mail inexistente devolve nulo sem revelar isso no tempo', async () => {
    const inicio = Date.now()
    expect(await verificarSenha('ninguem@exemplo.com', 'qualquer')).toBeNull()
    // A verificação contra um hash falso impede distinguir "usuário não
    // existe" de "senha errada" pela duração da resposta.
    expect(Date.now() - inicio).toBeGreaterThan(5)
  })
})

describe('sessões', () => {
  it('o token em claro não é gravado', async () => {
    const usuario = await criarUsuarioComSenha(conta)
    const { token } = await abrirSessao(usuario.id, {})

    const [linha] = await sqlAdmin<{ token_hash: string }[]>`select token_hash from sessions`
    expect(linha.token_hash).not.toBe(token)
  })

  it('valida e devolve o usuário', async () => {
    const usuario = await criarUsuarioComSenha(conta)
    const { token } = await abrirSessao(usuario.id, {})

    expect(await validarSessao(token)).toMatchObject({ userId: usuario.id })
  })

  it('sessão encerrada não vale mais', async () => {
    const usuario = await criarUsuarioComSenha(conta)
    const { token } = await abrirSessao(usuario.id, {})

    await encerrarSessao(token)
    expect(await validarSessao(token)).toBeNull()
  })

  it('AMEAÇA T12: sessão ociosa demais é bloqueada', async () => {
    const usuario = await criarUsuarioComSenha(conta)
    const { token } = await abrirSessao(usuario.id, {})

    await sqlAdmin`update sessions set last_seen_at = now() - interval '16 minutes'`

    expect(await validarSessao(token)).toBeNull()
  })

  it('sessão expirada não vale mais', async () => {
    const usuario = await criarUsuarioComSenha(conta)
    const { token } = await abrirSessao(usuario.id, {})

    await sqlAdmin`update sessions set expires_at = now() - interval '1 second'`

    expect(await validarSessao(token)).toBeNull()
  })

  it('token inventado não vale', async () => {
    expect(await validarSessao('token-inventado')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test:integration -- auth`
Expected: FAIL — módulos não encontrados.

- [ ] **Step 3: Escrever `src/data/users.ts`**

```ts
import { hash, verify } from '@node-rs/argon2'
import { comoUsuario, semUsuario } from './with-user'
import { semearCategoriasPadrao } from './categories'

export interface Usuario {
  id: string
  email: string
  displayName: string
  locale: string
  timezone: string
  monthStartDay: number
}

/**
 * Hash de referência para comparar quando o e-mail não existe. Sem ele, a
 * resposta volta na hora e um atacante descobre quais e-mails estão
 * cadastrados só pelo tempo. Gerado uma vez, na carga do módulo.
 */
const HASH_FALSO = await hash('senha-inexistente-para-tempo-constante')

function paraUsuario(linha: Record<string, unknown>): Usuario {
  return {
    id: linha.id as string,
    email: linha.email as string,
    displayName: linha.display_name as string,
    locale: linha.locale as string,
    timezone: linha.timezone as string,
    monthStartDay: linha.month_start_day as number,
  }
}

export async function criarUsuarioComSenha(dados: {
  email: string
  senha: string
  nome: string
}): Promise<Usuario> {
  const passwordHash = await hash(dados.senha)

  const usuario = await semUsuario(async (sql) => {
    const [linha] = await sql`
      insert into users (email, password_hash, display_name)
      values (${dados.email}, ${passwordHash}, ${dados.nome})
      returning *
    `
    return paraUsuario(linha)
  })

  await semearCategoriasPadrao(usuario.id)
  return usuario
}

export async function buscarUsuario(id: string): Promise<Usuario | null> {
  return comoUsuario(id, async (sql) => {
    const [linha] = await sql`select * from users where id = ${id}`
    return linha ? paraUsuario(linha) : null
  })
}

/** Devolve o usuário quando a senha confere, nulo quando não. */
export async function verificarSenha(email: string, senha: string): Promise<Usuario | null> {
  const linha = await semUsuario(async (sql) => {
    const [encontrado] = await sql`
      select * from users where lower(email) = lower(${email}) and is_active
    `
    return encontrado ?? null
  })

  // Verifica sempre, mesmo sem usuário: o custo do argon2 é o que iguala os
  // tempos de resposta e impede enumerar e-mails cadastrados.
  const hashParaTestar = (linha?.password_hash as string | undefined) ?? HASH_FALSO
  const confere = await verify(hashParaTestar, senha).catch(() => false)

  return linha && confere ? paraUsuario(linha) : null
}

export async function atualizarPreferencias(
  userId: string,
  dados: { displayName?: string; timezone?: string; monthStartDay?: number },
): Promise<Usuario> {
  const colunas: Record<string, unknown> = { updated_at: new Date() }
  if (dados.displayName !== undefined) colunas.display_name = dados.displayName
  if (dados.timezone !== undefined) colunas.timezone = dados.timezone
  if (dados.monthStartDay !== undefined) colunas.month_start_day = dados.monthStartDay

  return comoUsuario(userId, async (sql) => {
    const [linha] = await sql`update users set ${sql(colunas)} where id = ${userId} returning *`
    return paraUsuario(linha)
  })
}
```

Se o `await` de topo de módulo em `HASH_FALSO` causar problema no build, troque por uma constante calculada na primeira chamada e guardada em variável de módulo.

- [ ] **Step 4: Escrever `src/data/sessions.ts`**

```ts
import { createHash, randomBytes } from 'node:crypto'
import { semUsuario } from './with-user'

const TTL_MINUTOS = Number(process.env.SESSION_TTL_MINUTES ?? 43_200)
const OCIOSIDADE_MINUTOS = Number(process.env.SESSION_IDLE_LOCK_MINUTES ?? 15)

/** SHA-256 basta: o token tem 256 bits de aleatoriedade, não é senha humana. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function hashOpcional(valor: string | undefined): string | null {
  return valor ? createHash('sha256').update(valor).digest('hex') : null
}

export async function abrirSessao(
  userId: string,
  contexto: { userAgent?: string; ip?: string },
): Promise<{ token: string; expiraEm: Date }> {
  const token = randomBytes(32).toString('base64url')
  const expiraEm = new Date(Date.now() + TTL_MINUTOS * 60_000)

  await semUsuario((sql) => sql`
    insert into sessions (user_id, token_hash, expires_at, user_agent_hash, ip_hash)
    values (
      ${userId}, ${hashToken(token)}, ${expiraEm},
      ${hashOpcional(contexto.userAgent)}, ${hashOpcional(contexto.ip)}
    )
  `)

  return { token, expiraEm }
}

/**
 * Valida e renova o relógio de ociosidade. Três coisas invalidam: sessão
 * revogada, prazo total vencido, ou tempo demais sem uso — o bloqueio por
 * inatividade que o §11 exige.
 */
export async function validarSessao(token: string): Promise<{ userId: string } | null> {
  const linha = await semUsuario(async (sql) => {
    const [encontrada] = await sql<{ user_id: string }[]>`
      update sessions
      set last_seen_at = now()
      where token_hash = ${hashToken(token)}
        and revoked_at is null
        and expires_at > now()
        and last_seen_at > now() - make_interval(mins => ${OCIOSIDADE_MINUTOS})
      returning user_id
    `
    return encontrada ?? null
  })

  return linha ? { userId: linha.user_id } : null
}

export async function encerrarSessao(token: string): Promise<void> {
  await semUsuario((sql) => sql`
    update sessions set revoked_at = now() where token_hash = ${hashToken(token)}
  `)
}

export async function encerrarTodasSessoes(userId: string): Promise<void> {
  await semUsuario((sql) => sql`
    update sessions set revoked_at = now() where user_id = ${userId} and revoked_at is null
  `)
}
```

- [ ] **Step 5: Escrever `src/lib/session.ts`**

```ts
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { validarSessao } from '../data/sessions'
import { buscarUsuario, type Usuario } from '../data/users'

const NOME = process.env.SESSION_COOKIE_NAME ?? 'mt_session'

export async function definirCookieSessao(token: string, expiraEm: Date): Promise<void> {
  const jar = await cookies()
  jar.set(NOME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiraEm,
  })
}

export async function limparCookieSessao(): Promise<void> {
  const jar = await cookies()
  jar.delete(NOME)
}

export async function lerCookieSessao(): Promise<string | null> {
  const jar = await cookies()
  return jar.get(NOME)?.value ?? null
}

export async function usuarioAtual(): Promise<Usuario | null> {
  const token = await lerCookieSessao()
  if (!token) return null

  const sessao = await validarSessao(token)
  if (!sessao) return null

  return buscarUsuario(sessao.userId)
}

/** Para páginas e ações que exigem login. Redireciona quando não há sessão. */
export async function exigirUsuario(): Promise<Usuario> {
  const usuario = await usuarioAtual()
  if (!usuario) redirect('/entrar')
  return usuario
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npm run test:integration -- auth`
Expected: PASS — 10 testes.

- [ ] **Step 7: Commit**

```bash
git add src/data/users.ts src/data/sessions.ts src/lib/session.ts tests/integration/auth.test.ts
git commit -m "feat(auth): argon2, sessões no banco e bloqueio por inatividade

A verificação roda contra um hash falso quando o e-mail não existe: sem
isso o tempo de resposta revela quais e-mails estão cadastrados. Token de
sessão é gravado só como hash, e o cookie é HttpOnly, Secure e SameSite.
Ameaça T12 virou teste."
```

---

### Task 17: Casca da interface, formatação pt-BR e componentes de base

**Files:**
- Create: `src/lib/format.ts`, `src/components/status-badge.tsx`, `src/components/dialog.tsx`, `src/components/toast.tsx`, `src/components/states.tsx`
- Modify: `next.config.ts` (cabeçalhos de segurança), `src/app/layout.tsx`
- Test: `tests/unit/format.test.ts`, `tests/unit/interface-proibicoes.test.ts`

**Interfaces:**
- Consumes: `formatBRL` de `src/domain/money.ts`; `Cents`, `IsoDate`, `TransactionStatus` de `types.ts`.
- Produces:
  - `src/lib/format.ts`: `dinheiro(valor: Cents): string`, `dataCurta(data: IsoDate): string`, `dataLonga(data: IsoDate): string`, `rotuloStatus(status: TransactionStatus, atrasado: boolean): { texto: string; icone: string }`.
  - `<StatusBadge status atrasado />`, `<DialogConfirmacao />`, `<ToastDesfazer />`, `<Carregando />`, `<SemDados />`, `<SemResultados />`, `<ErroRecuperavel />`.

- [ ] **Step 1: Escrever os testes que falham**

`tests/unit/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { dataCurta, dataLonga, dinheiro, rotuloStatus } from '../../src/lib/format'
import { cents } from '../../src/domain/money'
import { isoDate } from '../../src/domain/dates'

describe('formatação pt-BR', () => {
  it('formata dinheiro', () => {
    expect(dinheiro(cents(123456))).toBe('R$ 1.234,56')
  })

  it('formata data sem deslocar por fuso', () => {
    // O bug clássico: new Date('2026-09-18') é meia-noite UTC, que em
    // São Paulo é dia 17. A formatação precisa tratar como data civil.
    expect(dataCurta(isoDate('2026-09-18'))).toBe('18/09/2026')
    expect(dataCurta(isoDate('2026-01-01'))).toBe('01/01/2026')
  })

  it('formata data longa em pt-BR', () => {
    expect(dataLonga(isoDate('2026-09-18'))).toBe('18 de setembro de 2026')
  })
})

describe('rotuloStatus', () => {
  it('atrasado tem texto próprio, não só cor', () => {
    const rotulo = rotuloStatus('previsto', true)
    expect(rotulo.texto).toBe('Atrasado')
    expect(rotulo.icone).not.toBe('')
  })

  it('cada estado tem texto legível', () => {
    const estados = ['previsto', 'pendente', 'liquidado', 'conciliado', 'cancelado', 'estornado'] as const
    for (const estado of estados) {
      const rotulo = rotuloStatus(estado, false)
      expect(rotulo.texto.length).toBeGreaterThan(0)
      expect(rotulo.icone.length).toBeGreaterThan(0)
    }
  })
})
```

`tests/unit/interface-proibicoes.test.ts`:

```ts
import { globSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// `globSync` de node:fs exige Node 22. Em versão anterior, troque por uma
// varredura recursiva com readdirSync.
const ARQUIVOS = globSync('src/**/*.{ts,tsx}')

describe('proibições de interface', () => {
  it('não usa alert, confirm ou prompt do navegador (§13)', () => {
    const violacoes: string[] = []
    for (const arquivo of ARQUIVOS) {
      const conteudo = readFileSync(arquivo, 'utf8')
      if (/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(conteudo)) {
        violacoes.push(arquivo)
      }
    }
    expect(violacoes).toEqual([])
  })

  it('não usa dangerouslySetInnerHTML (§5.3: texto do usuário é não confiável)', () => {
    const violacoes = ARQUIVOS.filter((a) =>
      readFileSync(a, 'utf8').includes('dangerouslySetInnerHTML'),
    )
    expect(violacoes).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- format`
Expected: FAIL — `src/lib/format` não encontrado.

- [ ] **Step 3: Escrever `src/lib/format.ts`**

```ts
import { formatBRL } from '../domain/money'
import type { Cents, IsoDate, TransactionStatus } from '../domain/types'

export const dinheiro = formatBRL

/**
 * Formata a data civil sem passar por fuso. `new Date('2026-09-18')` é
 * meia-noite UTC, que em São Paulo ainda é dia 17 — o erro mais comum em
 * aplicação financeira brasileira.
 */
function partes(data: IsoDate): { dia: string; mes: number; ano: string } {
  const [ano, mes, dia] = data.split('-')
  return { dia, mes: Number(mes), ano }
}

export function dataCurta(data: IsoDate): string {
  const { dia, mes, ano } = partes(data)
  return `${dia}/${String(mes).padStart(2, '0')}/${ano}`
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

export function dataLonga(data: IsoDate): string {
  const { dia, mes, ano } = partes(data)
  return `${Number(dia)} de ${MESES[mes - 1]} de ${ano}`
}

/**
 * Texto e ícone para cada estado. Nunca só cor (§14): quem não distingue
 * vermelho de verde ainda precisa saber que a conta está atrasada.
 */
export function rotuloStatus(
  status: TransactionStatus,
  atrasado: boolean,
): { texto: string; icone: string } {
  if (atrasado) return { texto: 'Atrasado', icone: '⚠' }

  const rotulos: Record<TransactionStatus, { texto: string; icone: string }> = {
    previsto: { texto: 'Previsto', icone: '◷' },
    pendente: { texto: 'Pendente', icone: '◐' },
    liquidado: { texto: 'Liquidado', icone: '✓' },
    conciliado: { texto: 'Conciliado', icone: '✓✓' },
    cancelado: { texto: 'Cancelado', icone: '✕' },
    estornado: { texto: 'Estornado', icone: '↩' },
  }
  return rotulos[status]
}
```

- [ ] **Step 4: Escrever `src/components/status-badge.tsx`**

```tsx
import { rotuloStatus } from '../lib/format'
import type { TransactionStatus } from '../domain/types'

const CORES: Record<string, string> = {
  Atrasado: 'bg-red-50 text-red-900 border-red-200',
  Previsto: 'bg-slate-50 text-slate-700 border-slate-200',
  Pendente: 'bg-amber-50 text-amber-900 border-amber-200',
  Liquidado: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  Conciliado: 'bg-emerald-100 text-emerald-950 border-emerald-300',
  Cancelado: 'bg-slate-100 text-slate-600 border-slate-300',
  Estornado: 'bg-slate-100 text-slate-600 border-slate-300',
}

export function StatusBadge({
  status,
  atrasado = false,
}: {
  status: TransactionStatus
  atrasado?: boolean
}) {
  const { texto, icone } = rotuloStatus(status, atrasado)

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${CORES[texto]}`}
    >
      {/* O ícone é decorativo; o texto ao lado é o que comunica. */}
      <span aria-hidden="true">{icone}</span>
      {texto}
    </span>
  )
}
```

- [ ] **Step 5: Escrever `src/components/dialog.tsx`**

```tsx
'use client'

import { useEffect, useRef } from 'react'

/**
 * Substitui `confirm()`, que o §13 proíbe: o diálogo nativo não é
 * estilizável, não é traduzível e trava a página inteira. O `<dialog>` do
 * HTML já prende o foco e fecha no Esc.
 */
export function DialogConfirmacao({
  aberto,
  titulo,
  descricao,
  rotuloConfirmar = 'Confirmar',
  perigoso = false,
  aoConfirmar,
  aoCancelar,
}: {
  aberto: boolean
  titulo: string
  descricao: string
  rotuloConfirmar?: string
  perigoso?: boolean
  aoConfirmar: () => void
  aoCancelar: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialogo = ref.current
    if (!dialogo) return
    if (aberto && !dialogo.open) dialogo.showModal()
    if (!aberto && dialogo.open) dialogo.close()
  }, [aberto])

  return (
    <dialog
      ref={ref}
      onCancel={(evento) => {
        evento.preventDefault()
        aoCancelar()
      }}
      aria-labelledby="dialogo-titulo"
      aria-describedby="dialogo-descricao"
      className="rounded-lg border border-slate-200 p-0 backdrop:bg-slate-900/40"
    >
      <div className="max-w-md p-6">
        <h2 id="dialogo-titulo" className="text-lg font-semibold text-slate-900">
          {titulo}
        </h2>
        <p id="dialogo-descricao" className="mt-2 text-sm text-slate-600">
          {descricao}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={aoCancelar}
            className="rounded border border-slate-300 px-4 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={aoConfirmar}
            className={`rounded px-4 py-2 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
              perigoso ? 'bg-red-700 hover:bg-red-800' : 'bg-slate-900 hover:bg-slate-800'
            }`}
          >
            {rotuloConfirmar}
          </button>
        </div>
      </div>
    </dialog>
  )
}
```

- [ ] **Step 6: Escrever `src/components/toast.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'

/**
 * Aviso curto com desfazer (§15). `role="status"` faz o leitor de tela
 * anunciar sem roubar o foco de onde a pessoa está.
 */
export function ToastDesfazer({
  mensagem,
  aoDesfazer,
  segundos = 8,
}: {
  mensagem: string
  aoDesfazer?: () => void
  segundos?: number
}) {
  const [visivel, setVisivel] = useState(true)

  useEffect(() => {
    const relogio = setTimeout(() => setVisivel(false), segundos * 1000)
    return () => clearTimeout(relogio)
  }, [segundos])

  if (!visivel) return null

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-lg"
    >
      <span>{mensagem}</span>
      {aoDesfazer && (
        <button
          type="button"
          onClick={() => {
            aoDesfazer()
            setVisivel(false)
          }}
          className="font-medium underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Desfazer
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Escrever `src/components/states.tsx`**

```tsx
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
```

- [ ] **Step 8: Configurar os cabeçalhos de segurança**

`next.config.ts`:

```ts
import type { NextConfig } from 'next'

/**
 * CSP restritiva (§11). `unsafe-inline` em style é concessão ao Tailwind;
 * script não tem exceção nenhuma. Nenhum domínio externo é permitido —
 * a aplicação não carrega fonte, script nem imagem de terceiros.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ')

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
    ]
  },
}

export default nextConfig
```

- [ ] **Step 9: Escrever a casca**

`src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Money Tree',
  description: 'Gestão financeira pessoal',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded focus:bg-white focus:px-4 focus:py-2"
        >
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  )
}
```

`src/app/(app)/layout.tsx` — o grupo de rotas que exige login:

```tsx
import Link from 'next/link'
import { exigirUsuario } from '../../lib/session'

const LINKS = [
  { href: '/', rotulo: 'Saldos' },
  { href: '/lancamentos', rotulo: 'Lançamentos' },
  { href: '/contas', rotulo: 'Contas' },
  { href: '/categorias', rotulo: 'Categorias' },
  { href: '/configuracoes', rotulo: 'Configurações' },
]

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const usuario = await exigirUsuario()

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <p className="text-lg font-semibold">Money Tree</p>
        <nav aria-label="Principal">
          <ul className="flex flex-wrap gap-4 text-sm">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rounded px-1 py-0.5 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {link.rotulo}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="text-sm text-slate-600">{usuario.displayName}</p>
      </header>
      <main id="conteudo">{children}</main>
    </div>
  )
}
```

- [ ] **Step 10: Rodar os testes e ver passar**

Run: `npm test`
Expected: PASS — inclusive os dois testes de proibição.

- [ ] **Step 11: Commit**

```bash
git add src/lib/format.ts src/components src/app next.config.ts tests/unit/format.test.ts tests/unit/interface-proibicoes.test.ts
git commit -m "feat(ui): casca, formatação pt-BR, componentes de base e CSP

Data civil é formatada sem passar por Date: new Date('2026-09-18') é
meia-noite UTC e em São Paulo ainda é dia 17. Estado leva ícone e texto,
nunca só cor. ErroRecuperavel exige as três informações do §13 na
assinatura, para que não seja possível esquecer uma. Um teste varre o
código atrás de alert, confirm, prompt e dangerouslySetInnerHTML."
```

---

### Task 18: Tela de entrada

**Files:**
- Create: `src/app/entrar/page.tsx`, `src/app/entrar/acoes.ts`, `src/lib/rate-limit.ts`
- Test: `tests/unit/rate-limit.test.ts`

**Interfaces:**
- Consumes: `verificarSenha`, `abrirSessao`, `definirCookieSessao`, `registrarEvento`, `log`.
- Produces: `src/lib/rate-limit.ts` exporta `verificarLimite(chave: string): { permitido: boolean; esperarSegundos: number }` e `registrarTentativa(chave: string, sucesso: boolean): void`; `src/app/entrar/acoes.ts` exporta `entrar(estadoAnterior, formData)` e `sair()`.

- [ ] **Step 1: Escrever o teste que falha**

`tests/unit/rate-limit.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { limparLimites, registrarTentativa, verificarLimite } from '../../src/lib/rate-limit'

beforeEach(() => {
  limparLimites()
  vi.useRealTimers()
})

describe('limite de tentativas', () => {
  it('permite as primeiras tentativas', () => {
    for (let i = 0; i < 5; i++) {
      expect(verificarLimite('pessoa@exemplo.com').permitido).toBe(true)
      registrarTentativa('pessoa@exemplo.com', false)
    }
  })

  it('AMEAÇA T2: bloqueia após cinco falhas', () => {
    for (let i = 0; i < 5; i++) registrarTentativa('pessoa@exemplo.com', false)

    const resultado = verificarLimite('pessoa@exemplo.com')
    expect(resultado.permitido).toBe(false)
    expect(resultado.esperarSegundos).toBeGreaterThan(0)
  })

  it('sucesso zera a contagem', () => {
    for (let i = 0; i < 4; i++) registrarTentativa('pessoa@exemplo.com', false)
    registrarTentativa('pessoa@exemplo.com', true)

    expect(verificarLimite('pessoa@exemplo.com').permitido).toBe(true)
  })

  it('chaves diferentes não interferem', () => {
    for (let i = 0; i < 5; i++) registrarTentativa('a@exemplo.com', false)

    expect(verificarLimite('a@exemplo.com').permitido).toBe(false)
    expect(verificarLimite('b@exemplo.com').permitido).toBe(true)
  })

  it('o bloqueio expira', () => {
    vi.useFakeTimers()
    for (let i = 0; i < 5; i++) registrarTentativa('pessoa@exemplo.com', false)
    expect(verificarLimite('pessoa@exemplo.com').permitido).toBe(false)

    vi.advanceTimersByTime(16 * 60 * 1000)
    expect(verificarLimite('pessoa@exemplo.com').permitido).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- rate-limit`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Escrever `src/lib/rate-limit.ts`**

```ts
const MAX_FALHAS = 5
const JANELA_MS = 15 * 60 * 1000

interface Registro {
  falhas: number
  primeiraFalhaEm: number
}

/**
 * Contagem em memória. Para uma aplicação local de instância única isso
 * basta e não acrescenta dependência. Reiniciar o servidor zera a contagem —
 * limitação aceita e registrada: se o Money Tree passar a rodar em mais de
 * uma instância, isto precisa ir para o banco.
 */
const registros = new Map<string, Registro>()

export function verificarLimite(chave: string): { permitido: boolean; esperarSegundos: number } {
  const registro = registros.get(chave)
  if (!registro) return { permitido: true, esperarSegundos: 0 }

  const decorrido = Date.now() - registro.primeiraFalhaEm
  if (decorrido > JANELA_MS) {
    registros.delete(chave)
    return { permitido: true, esperarSegundos: 0 }
  }

  if (registro.falhas >= MAX_FALHAS) {
    return { permitido: false, esperarSegundos: Math.ceil((JANELA_MS - decorrido) / 1000) }
  }

  return { permitido: true, esperarSegundos: 0 }
}

export function registrarTentativa(chave: string, sucesso: boolean): void {
  if (sucesso) {
    registros.delete(chave)
    return
  }

  const registro = registros.get(chave)
  if (!registro || Date.now() - registro.primeiraFalhaEm > JANELA_MS) {
    registros.set(chave, { falhas: 1, primeiraFalhaEm: Date.now() })
    return
  }

  registro.falhas += 1
}

/** Só para teste. */
export function limparLimites(): void {
  registros.clear()
}
```

- [ ] **Step 4: Escrever `src/app/entrar/acoes.ts`**

```ts
'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { verificarSenha } from '../../data/users'
import { abrirSessao, encerrarSessao } from '../../data/sessions'
import { registrarEvento } from '../../data/audit'
import { definirCookieSessao, lerCookieSessao, limparCookieSessao } from '../../lib/session'
import { registrarTentativa, verificarLimite } from '../../lib/rate-limit'
import { log } from '../../lib/logger'

const Entrada = z.object({
  email: z.string().email('Informe um e-mail válido'),
  senha: z.string().min(1, 'Informe a senha'),
})

export interface EstadoEntrar {
  erro?: string
  /** Preservado para que o formulário não perca o que foi digitado (§13). */
  email?: string
}

export async function entrar(
  _anterior: EstadoEntrar,
  formData: FormData,
): Promise<EstadoEntrar> {
  const bruto = {
    email: String(formData.get('email') ?? ''),
    senha: String(formData.get('senha') ?? ''),
  }

  const analise = Entrada.safeParse(bruto)
  if (!analise.success) {
    return { erro: analise.error.issues[0].message, email: bruto.email }
  }

  const chave = analise.data.email.toLowerCase()
  const limite = verificarLimite(chave)
  if (!limite.permitido) {
    return {
      erro: `Muitas tentativas. Tente de novo em ${Math.ceil(limite.esperarSegundos / 60)} minutos.`,
      email: bruto.email,
    }
  }

  const usuario = await verificarSenha(analise.data.email, analise.data.senha)
  registrarTentativa(chave, usuario !== null)

  if (!usuario) {
    // Mensagem única: dizer "e-mail não cadastrado" entrega quais contas
    // existem. O log também não registra o e-mail (§11).
    log.warn('login.falhou')
    return { erro: 'E-mail ou senha incorretos.', email: bruto.email }
  }

  const cabecalhos = await headers()
  const { token, expiraEm } = await abrirSessao(usuario.id, {
    userAgent: cabecalhos.get('user-agent') ?? undefined,
    ip: cabecalhos.get('x-forwarded-for') ?? undefined,
  })

  await definirCookieSessao(token, expiraEm)
  await registrarEvento(usuario.id, {
    eventType: 'sessao.aberta',
    source: 'usuario',
    result: 'sucesso',
  })

  redirect('/')
}

export async function sair(): Promise<void> {
  const token = await lerCookieSessao()
  if (token) await encerrarSessao(token)
  await limparCookieSessao()
  redirect('/entrar')
}
```

- [ ] **Step 5: Escrever `src/app/entrar/page.tsx`**

```tsx
'use client'

import { useActionState } from 'react'
import { entrar, type EstadoEntrar } from './acoes'

const INICIAL: EstadoEntrar = {}

export default function PaginaEntrar() {
  const [estado, acao, enviando] = useActionState(entrar, INICIAL)

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold">Money Tree</h1>
      <p className="mt-1 text-sm text-slate-600">Entre para ver suas contas.</p>

      <form action={acao} className="mt-8 space-y-4">
        {estado.erro && (
          <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <span aria-hidden="true">⚠ </span>
            {estado.erro}
          </p>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            defaultValue={estado.email ?? ''}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          />
        </div>

        <div>
          <label htmlFor="senha" className="block text-sm font-medium">
            Senha
          </label>
          <input
            id="senha"
            name="senha"
            type="password"
            autoComplete="current-password"
            required
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          />
        </div>

        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
```

O `disabled` enquanto envia é o que impede envio duplicado, exigência do §13.

- [ ] **Step 6: Rodar e ver passar**

Run: `npm test -- rate-limit`
Expected: PASS — 5 testes.

- [ ] **Step 7: Verificar manualmente**

```bash
npm run dev
```

Abra `http://localhost:3000/entrar`. Crie um usuário pelo console antes:

```bash
npx tsx -e "import('./src/data/users.ts').then(m => m.criarUsuarioComSenha({ email: 'voce@exemplo.com', senha: 'uma-senha-longa', nome: 'Você' }).then(u => console.log(u.id)))"
```

Expected: entrar com a senha certa leva a `/`; senha errada mostra "E-mail ou senha incorretos." e **mantém o e-mail preenchido**; seis tentativas erradas mostram a mensagem de espera.

- [ ] **Step 8: Commit**

```bash
git add src/app/entrar src/lib/rate-limit.ts tests/unit/rate-limit.test.ts
git commit -m "feat(auth): tela de entrada com limite de tentativas

Mensagem única para e-mail errado e senha errada: distinguir entrega
quais contas existem. O campo de e-mail sobrevive ao erro, como o §13
exige. Contagem em memória basta para instância única e está registrada
como limitação."
```

---

### Task 19: Contas e a tela de saldos

**Files:**
- Create: `src/app/(app)/page.tsx`, `src/app/(app)/contas/page.tsx`, `src/app/(app)/contas/nova/page.tsx`, `src/app/(app)/contas/[id]/page.tsx`, `src/app/(app)/contas/acoes.ts`, `src/app/(app)/contas/formulario.tsx`
- Test: `tests/integration/acoes-contas.test.ts`

**Interfaces:**
- Consumes: `listarContas`, `listarContasComSaldo`, `criarConta`, `atualizarConta`, `arquivarConta`, `buscarConta`; `somarSaldos` de `src/domain/balance.ts`; `parseBRL`, `dinheiro`, `dataCurta`; `exigirUsuario`; `registrarEvento`.
- Produces: `src/app/(app)/contas/acoes.ts` exporta `salvarConta(estadoAnterior, formData): Promise<EstadoFormularioConta>` e `arquivar(formData): Promise<void>`; `interface EstadoFormularioConta { erro?: string; campoInvalido?: string; valores?: Record<string, string> }`.

- [ ] **Step 1: Escrever o teste que falha**

`tests/integration/acoes-contas.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, limparBanco, sqlAdmin } from './helpers'
import { criarConta, listarContasComSaldo } from '../../src/data/accounts'
import { somarSaldos } from '../../src/domain/balance'
import { criarLancamento } from '../../src/data/transactions'
import { isoDate } from '../../src/domain/dates'
import { cents } from '../../src/domain/money'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

describe('total da tela de saldos', () => {
  it('soma só o que está marcado como disponível', async () => {
    const usuario = await criarUsuario()

    await criarConta(usuario, {
      name: 'Corrente',
      type: 'corrente',
      initialBalanceCents: cents(100_000),
      initialBalanceDate: isoDate('2026-09-01'),
    })
    await criarConta(usuario, {
      name: 'Cartão',
      type: 'cartao_credito',
      initialBalanceCents: cents(-50_000),
      initialBalanceDate: isoDate('2026-09-01'),
    })

    const contas = await listarContasComSaldo(usuario)
    const disponivel = somarSaldos(contas.filter((c) => c.includeInAvailable && c.isLiquid))

    expect(disponivel.balanceCents).toBe(100_000)
    expect(contas).toHaveLength(2)
  })

  it('uma conta estimada torna o total estimado', async () => {
    const usuario = await criarUsuario()
    await criarConta(usuario, {
      name: 'Corrente',
      type: 'corrente',
      initialBalanceCents: cents(100_000),
      initialBalanceDate: isoDate('2026-09-01'),
    })

    const contas = await listarContasComSaldo(usuario)
    expect(somarSaldos(contas).isEstimated).toBe(true)
  })

  it('o total acompanha os lançamentos liquidados', async () => {
    const usuario = await criarUsuario()
    const conta = await criarConta(usuario, {
      name: 'Corrente',
      type: 'corrente',
      initialBalanceCents: cents(100_000),
      initialBalanceDate: isoDate('2026-09-01'),
    })

    await criarLancamento(usuario, {
      accountId: conta.id,
      kind: 'receita',
      nature: 'fixa',
      description: 'Salário',
      amountCents: cents(300_000),
      status: 'liquidado',
      competenceDate: isoDate('2026-09-05'),
      settledDate: isoDate('2026-09-05'),
    })

    const contas = await listarContasComSaldo(usuario)
    expect(somarSaldos(contas).balanceCents).toBe(400_000)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar ou passar**

Run: `npm run test:integration -- acoes-contas`
Expected: PASS — este teste exercita código que já existe. Ele está aqui para travar o comportamento da tela antes de escrevê-la: se `somarSaldos` mudar, a tela quebra e o teste avisa.

- [ ] **Step 3: Escrever `src/app/(app)/contas/acoes.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { arquivarConta, atualizarConta, criarConta } from '../../../data/accounts'
import { registrarEvento } from '../../../data/audit'
import { exigirUsuario } from '../../../lib/session'
import { isoDate } from '../../../domain/dates'
import { parseBRL } from '../../../domain/money'
import type { AccountType } from '../../../domain/types'

const TIPOS: AccountType[] = [
  'corrente', 'pagamento', 'poupanca', 'carteira',
  'cartao_credito', 'investimento', 'emprestimo', 'outro',
]

const Formulario = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'Informe o nome da conta'),
  type: z.enum(TIPOS as [AccountType, ...AccountType[]]),
  institution: z.string().trim().optional(),
  saldoInicial: z.string(),
  initialBalanceDate: z.string(),
  includeInAvailable: z.string().optional(),
})

export interface EstadoFormularioConta {
  erro?: string
  campoInvalido?: string
  /** O que o usuário digitou, para o formulário não esvaziar (§13). */
  valores?: Record<string, string>
}

export async function salvarConta(
  _anterior: EstadoFormularioConta,
  formData: FormData,
): Promise<EstadoFormularioConta> {
  const usuario = await exigirUsuario()

  const bruto = Object.fromEntries(formData) as Record<string, string>
  const analise = Formulario.safeParse(bruto)

  if (!analise.success) {
    const problema = analise.error.issues[0]
    return { erro: problema.message, campoInvalido: String(problema.path[0]), valores: bruto }
  }

  let saldoInicialCents
  let dataInicial
  try {
    saldoInicialCents = parseBRL(analise.data.saldoInicial || '0')
    dataInicial = isoDate(analise.data.initialBalanceDate)
  } catch (erro) {
    return {
      erro: erro instanceof Error ? erro.message : 'Valor ou data inválidos',
      campoInvalido: 'saldoInicial',
      valores: bruto,
    }
  }

  const dados = {
    name: analise.data.name,
    type: analise.data.type,
    institution: analise.data.institution || null,
    initialBalanceCents: saldoInicialCents,
    initialBalanceDate: dataInicial,
    // Ausente no formulário significa desmarcado. Só respeitamos a escolha
    // explícita; a criação sem o campo deixa o gatilho decidir pelo tipo.
    includeInAvailable: analise.data.includeInAvailable === 'on',
  }

  const conta = analise.data.id
    ? await atualizarConta(usuario.id, analise.data.id, dados)
    : await criarConta(usuario.id, dados)

  await registrarEvento(usuario.id, {
    eventType: analise.data.id ? 'conta.atualizada' : 'conta.criada',
    objectType: 'account',
    objectId: conta.id,
    source: 'usuario',
    result: 'sucesso',
  })

  revalidatePath('/contas')
  revalidatePath('/')
  redirect('/contas')
}

export async function arquivar(formData: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  const id = String(formData.get('id'))

  await arquivarConta(usuario.id, id)
  await registrarEvento(usuario.id, {
    eventType: 'conta.arquivada',
    objectType: 'account',
    objectId: id,
    source: 'usuario',
    result: 'sucesso',
  })

  revalidatePath('/contas')
  revalidatePath('/')
}
```

- [ ] **Step 4: Escrever `src/app/(app)/contas/formulario.tsx`**

```tsx
'use client'

import { useActionState } from 'react'
import { salvarConta, type EstadoFormularioConta } from './acoes'
import type { Conta } from '../../../data/accounts'

const TIPOS = [
  { valor: 'corrente', rotulo: 'Conta corrente' },
  { valor: 'pagamento', rotulo: 'Conta de pagamento' },
  { valor: 'poupanca', rotulo: 'Poupança' },
  { valor: 'carteira', rotulo: 'Dinheiro / carteira' },
  { valor: 'cartao_credito', rotulo: 'Cartão de crédito' },
  { valor: 'investimento', rotulo: 'Investimento' },
  { valor: 'emprestimo', rotulo: 'Empréstimo ou financiamento' },
  { valor: 'outro', rotulo: 'Outro ativo ou dívida' },
]

const INICIAL: EstadoFormularioConta = {}

export function FormularioConta({ conta }: { conta?: Conta }) {
  const [estado, acao, enviando] = useActionState(salvarConta, INICIAL)
  const v = estado.valores ?? {}

  return (
    <form action={acao} className="max-w-lg space-y-4">
      {conta && <input type="hidden" name="id" value={conta.id} />}

      {estado.erro && (
        <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <span aria-hidden="true">⚠ </span>
          {estado.erro}
        </p>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium">Nome</label>
        <input
          id="name" name="name" required autoFocus={estado.campoInvalido === 'name'}
          defaultValue={v.name ?? conta?.name ?? ''}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        />
      </div>

      <div>
        <label htmlFor="type" className="block text-sm font-medium">Tipo</label>
        <select
          id="type" name="type" required
          defaultValue={v.type ?? conta?.type ?? 'corrente'}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        >
          {TIPOS.map((tipo) => (
            <option key={tipo.valor} value={tipo.valor}>{tipo.rotulo}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="institution" className="block text-sm font-medium">
          Instituição <span className="text-slate-500">(opcional)</span>
        </label>
        <input
          id="institution" name="institution"
          defaultValue={v.institution ?? conta?.institution ?? ''}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="saldoInicial" className="block text-sm font-medium">Saldo inicial</label>
          <input
            id="saldoInicial" name="saldoInicial" inputMode="decimal" placeholder="0,00"
            autoFocus={estado.campoInvalido === 'saldoInicial'}
            defaultValue={
              v.saldoInicial ??
              (conta ? (conta.initialBalanceCents / 100).toFixed(2).replace('.', ',') : '')
            }
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
          <p className="mt-1 text-xs text-slate-500">Use vírgula para os centavos.</p>
        </div>

        <div>
          <label htmlFor="initialBalanceDate" className="block text-sm font-medium">
            Data do saldo inicial
          </label>
          <input
            id="initialBalanceDate" name="initialBalanceDate" type="date" required
            defaultValue={v.initialBalanceDate ?? conta?.initialBalanceDate ?? ''}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>
      </div>

      <div className="flex items-start gap-2">
        <input
          id="includeInAvailable" name="includeInAvailable" type="checkbox"
          defaultChecked={conta?.includeInAvailable ?? true}
          className="mt-1"
        />
        <label htmlFor="includeInAvailable" className="text-sm">
          Incluir no dinheiro disponível
          <span className="block text-xs text-slate-500">
            Cartão de crédito e investimento sem liquidez ficam de fora por padrão. Limite de
            crédito não é dinheiro disponível.
          </span>
        </label>
      </div>

      <button
        type="submit" disabled={enviando}
        className="rounded bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-60"
      >
        {enviando ? 'Salvando…' : 'Salvar conta'}
      </button>
    </form>
  )
}
```

- [ ] **Step 5: Escrever as páginas de contas**

`src/app/(app)/contas/page.tsx`:

```tsx
import Link from 'next/link'
import { listarContasComSaldo } from '../../../data/accounts'
import { exigirUsuario } from '../../../lib/session'
import { dinheiro } from '../../../lib/format'
import { SemDados } from '../../../components/states'
import { arquivar } from './acoes'

export default async function PaginaContas() {
  const usuario = await exigirUsuario()
  const contas = await listarContasComSaldo(usuario.id)

  return (
    <section>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Contas</h1>
        <Link href="/contas/nova" className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">
          Nova conta
        </Link>
      </div>

      {contas.length === 0 ? (
        <SemDados
          titulo="Nenhuma conta cadastrada"
          descricao="Comece pela conta onde seu salário cai. O saldo inicial é quanto há nela hoje."
          acao={
            <Link href="/contas/nova" className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">
              Cadastrar primeira conta
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {contas.map((conta) => (
            <li key={conta.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <Link href={`/contas/${conta.id}`} className="font-medium hover:underline">
                  {conta.name}
                </Link>
                <p className="text-sm text-slate-600">
                  {conta.institution ?? 'Sem instituição'}
                  {!conta.includeInAvailable && ' · fora do disponível'}
                </p>
              </div>

              <div className="text-right">
                <p className="font-medium tabular-nums">{dinheiro(conta.balanceCents)}</p>
                {conta.isEstimated && (
                  <p className="text-xs text-slate-500">
                    <span aria-hidden="true">≈ </span>Estimado, ainda não conciliado
                  </p>
                )}
              </div>

              <div className="flex gap-3 text-sm">
                <Link href={`/contas/${conta.id}/conciliar`} className="underline">
                  Conciliar
                </Link>
                <form action={arquivar}>
                  <input type="hidden" name="id" value={conta.id} />
                  <button type="submit" className="underline">Arquivar</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

`src/app/(app)/contas/nova/page.tsx`:

```tsx
import { FormularioConta } from '../formulario'

export default function PaginaNovaConta() {
  return (
    <section>
      <h1 className="mb-6 text-xl font-semibold">Nova conta</h1>
      <FormularioConta />
    </section>
  )
}
```

`src/app/(app)/contas/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { buscarConta } from '../../../../data/accounts'
import { exigirUsuario } from '../../../../lib/session'
import { FormularioConta } from '../formulario'

export default async function PaginaEditarConta({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const usuario = await exigirUsuario()
  const conta = await buscarConta(usuario.id, id)

  if (!conta) notFound()

  return (
    <section>
      <h1 className="mb-6 text-xl font-semibold">{conta.name}</h1>
      <FormularioConta conta={conta} />
    </section>
  )
}
```

- [ ] **Step 6: Escrever a tela de saldos**

`src/app/(app)/page.tsx`:

```tsx
import Link from 'next/link'
import { listarContasComSaldo } from '../../data/accounts'
import { somarSaldos } from '../../domain/balance'
import { exigirUsuario } from '../../lib/session'
import { dinheiro } from '../../lib/format'
import { SemDados } from '../../components/states'

export default async function PaginaSaldos() {
  const usuario = await exigirUsuario()
  const contas = await listarContasComSaldo(usuario.id)

  if (contas.length === 0) {
    return (
      <SemDados
        titulo="Vamos começar pelas suas contas"
        descricao="Cadastre onde seu dinheiro está hoje. Os saldos aparecem aqui assim que houver uma conta."
        acao={
          <Link href="/contas/nova" className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">
            Cadastrar conta
          </Link>
        }
      />
    )
  }

  const disponiveis = contas.filter((conta) => conta.includeInAvailable && conta.isLiquid)
  const total = somarSaldos(disponiveis)
  const patrimonio = somarSaldos(contas.filter((conta) => conta.includeInNetWorth))

  return (
    <section className="space-y-8">
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="text-sm font-medium text-slate-600">Saldo disponível</h1>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{dinheiro(total.balanceCents)}</p>
        <p className="mt-2 text-sm text-slate-600">
          {total.isEstimated
            ? 'Estimado: pelo menos uma conta ainda não foi conciliada com o extrato.'
            : 'Conferido com o extrato de todas as contas incluídas.'}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Soma das contas líquidas marcadas como disponíveis. Cartão de crédito e investimento
          sem liquidez não entram.
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-slate-600">Por conta</h2>
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {contas.map((conta) => (
            <li key={conta.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{conta.name}</p>
                {!conta.includeInAvailable && (
                  <p className="text-xs text-slate-500">Fora do disponível</p>
                )}
              </div>
              <p className="tabular-nums">
                {dinheiro(conta.balanceCents)}
                {conta.isEstimated && <span className="ml-1 text-xs text-slate-500">≈</span>}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-sm text-slate-600">
        Patrimônio líquido: <span className="tabular-nums">{dinheiro(patrimonio.balanceCents)}</span>
      </p>
    </section>
  )
}
```

- [ ] **Step 7: Verificar no navegador**

Run: `npm run dev`
Expected: `/contas` permite criar uma conta; `/` mostra o saldo com o aviso de estimado; criar um cartão mostra "fora do disponível" e ele não entra no total.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)" tests/integration/acoes-contas.test.ts
git commit -m "feat(ui): contas e tela de saldos

O disponível soma só conta líquida e incluída; cartão fica fora e a tela
diz isso em texto. Saldo não conciliado aparece como estimado, com a
explicação junto — o §6.1 exige o aviso, não a letra miúda."
```

---

### Task 20: Categorias

**Files:**
- Create: `src/app/(app)/categorias/page.tsx`, `src/app/(app)/categorias/acoes.ts`, `src/app/(app)/categorias/formulario.tsx`
- Test: `tests/integration/acoes-categorias.test.ts`

**Interfaces:**
- Consumes: `listarCategorias`, `criarCategoria`, `atualizarCategoria`, `arquivarCategoria`; `exigirUsuario`; `registrarEvento`.
- Produces: `salvarCategoria(estadoAnterior, formData): Promise<EstadoFormularioCategoria>`, `arquivarCategoriaAcao(formData): Promise<void>`; `interface EstadoFormularioCategoria { erro?: string; valores?: Record<string, string> }`.

- [ ] **Step 1: Escrever o teste que falha**

`tests/integration/acoes-categorias.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, limparBanco, sqlAdmin } from './helpers'
import {
  arquivarCategoria,
  criarCategoria,
  listarCategorias,
  semearCategoriasPadrao,
} from '../../src/data/categories'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

describe('categorias', () => {
  it('monta a árvore de pai e filhas', async () => {
    const usuario = await criarUsuario()
    const pai = await criarCategoria(usuario, { name: 'Transporte', kind: 'despesa', sortOrder: 1 })
    await criarCategoria(usuario, {
      name: 'Combustível',
      kind: 'despesa',
      parentId: pai.id,
      sortOrder: 2,
    })

    const todas = await listarCategorias(usuario)
    const raizes = todas.filter((c) => c.parentId === null)
    const filhas = todas.filter((c) => c.parentId === pai.id)

    expect(raizes).toHaveLength(1)
    expect(filhas.map((f) => f.name)).toEqual(['Combustível'])
  })

  it('rejeita nome repetido dentro do mesmo pai, ignorando maiúsculas', async () => {
    const usuario = await criarUsuario()
    await criarCategoria(usuario, { name: 'Mercado', kind: 'despesa' })

    await expect(criarCategoria(usuario, { name: 'MERCADO', kind: 'despesa' })).rejects.toThrow()
  })

  it('permite o mesmo nome sob pais diferentes', async () => {
    const usuario = await criarUsuario()
    const casa = await criarCategoria(usuario, { name: 'Casa', kind: 'despesa' })
    const carro = await criarCategoria(usuario, { name: 'Carro', kind: 'despesa' })

    await criarCategoria(usuario, { name: 'Seguro', kind: 'despesa', parentId: casa.id })
    await expect(
      criarCategoria(usuario, { name: 'Seguro', kind: 'despesa', parentId: carro.id }),
    ).resolves.toBeDefined()
  })

  it('arquivar some da lista sem apagar o registro', async () => {
    const usuario = await criarUsuario()
    await semearCategoriasPadrao(usuario)
    const [primeira] = await listarCategorias(usuario)

    await arquivarCategoria(usuario, primeira.id)

    expect(await listarCategorias(usuario)).toHaveLength(13)
    expect(await listarCategorias(usuario, { incluirArquivadas: true })).toHaveLength(14)
  })

  it('categoria de sistema pode ser renomeada: is_system marca origem, não trava', async () => {
    const usuario = await criarUsuario()
    await semearCategoriasPadrao(usuario)
    const [moradia] = await listarCategorias(usuario)

    expect(moradia.isSystem).toBe(true)

    const { atualizarCategoria } = await import('../../src/data/categories')
    const renomeada = await atualizarCategoria(usuario, moradia.id, { name: 'Casa e aluguel' })
    expect(renomeada.name).toBe('Casa e aluguel')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar ou passar**

Run: `npm run test:integration -- acoes-categorias`
Expected: PASS — exercita código existente e trava o contrato antes da tela.

- [ ] **Step 3: Escrever `src/app/(app)/categorias/acoes.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  arquivarCategoria,
  atualizarCategoria,
  criarCategoria,
} from '../../../data/categories'
import { registrarEvento } from '../../../data/audit'
import { exigirUsuario } from '../../../lib/session'

const Formulario = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'Informe o nome da categoria'),
  kind: z.enum(['receita', 'despesa']),
  parentId: z.string().uuid().optional().or(z.literal('')),
})

export interface EstadoFormularioCategoria {
  erro?: string
  valores?: Record<string, string>
  sucesso?: boolean
}

export async function salvarCategoria(
  _anterior: EstadoFormularioCategoria,
  formData: FormData,
): Promise<EstadoFormularioCategoria> {
  const usuario = await exigirUsuario()
  const bruto = Object.fromEntries(formData) as Record<string, string>
  const analise = Formulario.safeParse(bruto)

  if (!analise.success) {
    return { erro: analise.error.issues[0].message, valores: bruto }
  }

  const dados = {
    name: analise.data.name,
    kind: analise.data.kind,
    parentId: analise.data.parentId || null,
  }

  try {
    const categoria = analise.data.id
      ? await atualizarCategoria(usuario.id, analise.data.id, dados)
      : await criarCategoria(usuario.id, dados)

    await registrarEvento(usuario.id, {
      eventType: analise.data.id ? 'categoria.atualizada' : 'categoria.criada',
      objectType: 'category',
      objectId: categoria.id,
      source: 'usuario',
      result: 'sucesso',
    })
  } catch (erro) {
    // O índice único do banco é quem garante a regra; aqui só traduzimos.
    const duplicada = erro instanceof Error && erro.message.includes('categories_nome_unico')
    return {
      erro: duplicada
        ? 'Já existe uma categoria com esse nome no mesmo grupo.'
        : 'Não foi possível salvar a categoria.',
      valores: bruto,
    }
  }

  revalidatePath('/categorias')
  return { sucesso: true }
}

export async function arquivarCategoriaAcao(formData: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  const id = String(formData.get('id'))

  await arquivarCategoria(usuario.id, id)
  await registrarEvento(usuario.id, {
    eventType: 'categoria.arquivada',
    objectType: 'category',
    objectId: id,
    source: 'usuario',
    result: 'sucesso',
  })

  revalidatePath('/categorias')
}
```

- [ ] **Step 4: Escrever `src/app/(app)/categorias/formulario.tsx`**

```tsx
'use client'

import { useActionState } from 'react'
import { salvarCategoria, type EstadoFormularioCategoria } from './acoes'
import type { Categoria } from '../../../data/categories'

const INICIAL: EstadoFormularioCategoria = {}

export function FormularioCategoria({ raizes }: { raizes: Categoria[] }) {
  const [estado, acao, enviando] = useActionState(salvarCategoria, INICIAL)
  const v = estado.valores ?? {}

  return (
    <form action={acao} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
      {estado.erro && (
        <p role="alert" className="w-full rounded border border-red-200 bg-red-50 p-2 text-sm text-red-900">
          <span aria-hidden="true">⚠ </span>
          {estado.erro}
        </p>
      )}

      <div className="grow">
        <label htmlFor="name" className="block text-sm font-medium">Nome</label>
        <input
          id="name" name="name" required defaultValue={v.name ?? ''}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        />
      </div>

      <div>
        <label htmlFor="kind" className="block text-sm font-medium">Tipo</label>
        <select
          id="kind" name="kind" defaultValue={v.kind ?? 'despesa'}
          className="mt-1 rounded border border-slate-300 px-3 py-2"
        >
          <option value="despesa">Despesa</option>
          <option value="receita">Receita</option>
        </select>
      </div>

      <div>
        <label htmlFor="parentId" className="block text-sm font-medium">
          Dentro de <span className="text-slate-500">(opcional)</span>
        </label>
        <select
          id="parentId" name="parentId" defaultValue={v.parentId ?? ''}
          className="mt-1 rounded border border-slate-300 px-3 py-2"
        >
          <option value="">Nenhuma</option>
          {raizes.map((raiz) => (
            <option key={raiz.id} value={raiz.id}>{raiz.name}</option>
          ))}
        </select>
      </div>

      <button
        type="submit" disabled={enviando}
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {enviando ? 'Salvando…' : 'Adicionar'}
      </button>
    </form>
  )
}
```

- [ ] **Step 5: Escrever `src/app/(app)/categorias/page.tsx`**

```tsx
import { listarCategorias } from '../../../data/categories'
import { exigirUsuario } from '../../../lib/session'
import { arquivarCategoriaAcao } from './acoes'
import { FormularioCategoria } from './formulario'

export default async function PaginaCategorias() {
  const usuario = await exigirUsuario()
  const todas = await listarCategorias(usuario.id)

  const raizes = todas.filter((categoria) => categoria.parentId === null)
  const filhasDe = (paiId: string) => todas.filter((categoria) => categoria.parentId === paiId)

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold">Categorias</h1>

      <FormularioCategoria raizes={raizes} />

      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {raizes.map((raiz) => (
          <li key={raiz.id} className="p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {raiz.name}
                <span className="ml-2 text-xs font-normal text-slate-500">
                  {raiz.kind === 'receita' ? 'Receita' : 'Despesa'}
                </span>
              </span>
              <form action={arquivarCategoriaAcao}>
                <input type="hidden" name="id" value={raiz.id} />
                <button type="submit" className="text-sm underline">Arquivar</button>
              </form>
            </div>

            {filhasDe(raiz.id).length > 0 && (
              <ul className="mt-2 space-y-1 pl-4">
                {filhasDe(raiz.id).map((filha) => (
                  <li key={filha.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{filha.name}</span>
                    <form action={arquivarCategoriaAcao}>
                      <input type="hidden" name="id" value={filha.id} />
                      <button type="submit" className="underline">Arquivar</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
```

- [ ] **Step 6: Rodar e verificar**

Run: `npm run test:integration -- acoes-categorias` e depois `npm run dev`
Expected: PASS nos testes; em `/categorias`, as catorze aparecem, dá para criar subcategoria e arquivar.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/categorias" tests/integration/acoes-categorias.test.ts
git commit -m "feat(ui): árvore de categorias

Nome repetido no mesmo grupo é barrado pelo índice único; a ação só
traduz o erro. is_system marca origem e não impede renomear — as catorze
padrão são sugestão, não imposição."
```

---

### Task 21: Lista de lançamentos com filtros

**Files:**
- Create: `src/app/(app)/lancamentos/page.tsx`, `src/app/(app)/lancamentos/filtros.tsx`
- Test: `tests/integration/lista-lancamentos.test.ts`

**Interfaces:**
- Consumes: `listarLancamentos`, `listarContas`, `listarCategorias`; `estaAtrasado`, `hojeEm`; `dinheiro`, `dataCurta`; `StatusBadge`; `SemDados`, `SemResultados`.
- Produces: página de lista com filtros por conta, categoria, estado e período, paginada por parâmetro de busca na URL.

Filtro na URL, e não em estado de componente, por três razões: a página pode ser recarregada sem perder o filtro, o link pode ser guardado, e o botão Voltar do navegador funciona como a pessoa espera.

- [ ] **Step 1: Escrever o teste que falha**

`tests/integration/lista-lancamentos.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, limparBanco, sqlAdmin } from './helpers'
import { criarConta } from '../../src/data/accounts'
import { criarCategoria } from '../../src/data/categories'
import { criarLancamento, listarLancamentos } from '../../src/data/transactions'
import { estaAtrasado } from '../../src/domain/transaction'
import { isoDate } from '../../src/domain/dates'
import { cents } from '../../src/domain/money'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

describe('lista de lançamentos', () => {
  it('ordena do mais recente para o mais antigo', async () => {
    const usuario = await criarUsuario()
    const conta = await criarConta(usuario, {
      name: 'Corrente', type: 'corrente',
      initialBalanceCents: cents(0), initialBalanceDate: isoDate('2026-09-01'),
    })
    const categoria = await criarCategoria(usuario, { name: 'Mercado', kind: 'despesa' })

    for (const dia of ['2026-09-05', '2026-09-20', '2026-09-12']) {
      await criarLancamento(usuario, {
        accountId: conta.id, categoryId: categoria.id,
        kind: 'despesa', nature: 'variavel', description: `Dia ${dia}`,
        amountCents: cents(1000), status: 'liquidado',
        competenceDate: isoDate(dia), settledDate: isoDate(dia),
      })
    }

    const { itens } = await listarLancamentos(usuario, {})
    expect(itens.map((i) => i.competenceDate)).toEqual(['2026-09-20', '2026-09-12', '2026-09-05'])
  })

  it('o atrasado é derivado na leitura, não gravado', async () => {
    const usuario = await criarUsuario()
    const conta = await criarConta(usuario, {
      name: 'Corrente', type: 'corrente',
      initialBalanceCents: cents(0), initialBalanceDate: isoDate('2026-09-01'),
    })
    const categoria = await criarCategoria(usuario, { name: 'Luz', kind: 'despesa' })

    await criarLancamento(usuario, {
      accountId: conta.id, categoryId: categoria.id,
      kind: 'despesa', nature: 'fixa', description: 'Conta de luz',
      amountCents: cents(15000), status: 'previsto',
      competenceDate: isoDate('2026-09-10'), settledDate: null,
    })

    const { itens } = await listarLancamentos(usuario, {})
    expect(itens[0].status).toBe('previsto')
    expect(estaAtrasado(itens[0], isoDate('2026-09-18'))).toBe(true)
    expect(estaAtrasado(itens[0], isoDate('2026-09-09'))).toBe(false)
  })

  it('filtra por estado', async () => {
    const usuario = await criarUsuario()
    const conta = await criarConta(usuario, {
      name: 'Corrente', type: 'corrente',
      initialBalanceCents: cents(0), initialBalanceDate: isoDate('2026-09-01'),
    })
    const categoria = await criarCategoria(usuario, { name: 'Mercado', kind: 'despesa' })

    await criarLancamento(usuario, {
      accountId: conta.id, categoryId: categoria.id, kind: 'despesa', nature: 'variavel',
      description: 'Paga', amountCents: cents(1000), status: 'liquidado',
      competenceDate: isoDate('2026-09-10'), settledDate: isoDate('2026-09-10'),
    })
    await criarLancamento(usuario, {
      accountId: conta.id, categoryId: categoria.id, kind: 'despesa', nature: 'variavel',
      description: 'Prevista', amountCents: cents(1000), status: 'previsto',
      competenceDate: isoDate('2026-09-25'), settledDate: null,
    })

    const previstos = await listarLancamentos(usuario, { status: 'previsto' })
    expect(previstos.total).toBe(1)
    expect(previstos.itens[0].description).toBe('Prevista')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar ou passar**

Run: `npm run test:integration -- lista-lancamentos`
Expected: PASS.

- [ ] **Step 3: Escrever `src/app/(app)/lancamentos/filtros.tsx`**

```tsx
import Link from 'next/link'
import type { Conta } from '../../../data/accounts'
import type { Categoria } from '../../../data/categories'

const ESTADOS = [
  { valor: '', rotulo: 'Todos os estados' },
  { valor: 'previsto', rotulo: 'Previsto' },
  { valor: 'pendente', rotulo: 'Pendente' },
  { valor: 'liquidado', rotulo: 'Liquidado' },
  { valor: 'conciliado', rotulo: 'Conciliado' },
  { valor: 'cancelado', rotulo: 'Cancelado' },
  { valor: 'estornado', rotulo: 'Estornado' },
]

/**
 * Formulário GET: o filtro vira parâmetro na URL. Recarregar não perde o
 * filtro, o link pode ser guardado e o botão Voltar funciona.
 */
export function Filtros({
  contas,
  categorias,
  atual,
}: {
  contas: Conta[]
  categorias: Categoria[]
  atual: Record<string, string>
}) {
  return (
    <form
      method="get"
      className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4"
    >
      <div>
        <label htmlFor="conta" className="block text-sm font-medium">Conta</label>
        <select id="conta" name="conta" defaultValue={atual.conta ?? ''} className="mt-1 rounded border border-slate-300 px-3 py-2">
          <option value="">Todas</option>
          {contas.map((conta) => (
            <option key={conta.id} value={conta.id}>{conta.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="categoria" className="block text-sm font-medium">Categoria</label>
        <select id="categoria" name="categoria" defaultValue={atual.categoria ?? ''} className="mt-1 rounded border border-slate-300 px-3 py-2">
          <option value="">Todas</option>
          {categorias.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>{categoria.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="estado" className="block text-sm font-medium">Estado</label>
        <select id="estado" name="estado" defaultValue={atual.estado ?? ''} className="mt-1 rounded border border-slate-300 px-3 py-2">
          {ESTADOS.map((estado) => (
            <option key={estado.valor} value={estado.valor}>{estado.rotulo}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="de" className="block text-sm font-medium">De</label>
        <input id="de" name="de" type="date" defaultValue={atual.de ?? ''} className="mt-1 rounded border border-slate-300 px-3 py-2" />
      </div>

      <div>
        <label htmlFor="ate" className="block text-sm font-medium">Até</label>
        <input id="ate" name="ate" type="date" defaultValue={atual.ate ?? ''} className="mt-1 rounded border border-slate-300 px-3 py-2" />
      </div>

      <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">
        Filtrar
      </button>
      <Link href="/lancamentos" className="px-2 py-2 text-sm underline">
        Limpar
      </Link>
    </form>
  )
}
```

- [ ] **Step 4: Escrever `src/app/(app)/lancamentos/page.tsx`**

```tsx
import Link from 'next/link'
import { listarContas } from '../../../data/accounts'
import { listarCategorias } from '../../../data/categories'
import { listarLancamentos } from '../../../data/transactions'
import { hojeEm, isoDate } from '../../../domain/dates'
import { estaAtrasado } from '../../../domain/transaction'
import { exigirUsuario } from '../../../lib/session'
import { dataCurta, dinheiro } from '../../../lib/format'
import { StatusBadge } from '../../../components/status-badge'
import { SemDados, SemResultados } from '../../../components/states'
import type { IsoDate, TransactionStatus } from '../../../domain/types'

const POR_PAGINA = 50

function dataOpcional(valor: string | undefined): IsoDate | undefined {
  if (!valor) return undefined
  try {
    return isoDate(valor)
  } catch {
    return undefined
  }
}

export default async function PaginaLancamentos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const usuario = await exigirUsuario()
  const params = await searchParams
  const texto = (chave: string) => (typeof params[chave] === 'string' ? params[chave] : undefined)

  const pagina = Math.max(1, Number(texto('pagina') ?? 1))

  const [contas, categorias, resultado] = await Promise.all([
    listarContas(usuario.id),
    listarCategorias(usuario.id),
    listarLancamentos(usuario.id, {
      accountId: texto('conta'),
      categoryId: texto('categoria'),
      status: texto('estado') as TransactionStatus | undefined,
      de: dataOpcional(texto('de')),
      ate: dataOpcional(texto('ate')),
      limite: POR_PAGINA,
      deslocamento: (pagina - 1) * POR_PAGINA,
    }),
  ])

  const hoje = hojeEm(usuario.timezone)
  const nomeConta = new Map(contas.map((conta) => [conta.id, conta.name]))
  const nomeCategoria = new Map(categorias.map((categoria) => [categoria.id, categoria.name]))
  const temFiltro = ['conta', 'categoria', 'estado', 'de', 'ate'].some((chave) => texto(chave))
  const totalPaginas = Math.max(1, Math.ceil(resultado.total / POR_PAGINA))

  const { Filtros } = await import('./filtros')

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Lançamentos</h1>
        <Link href="/lancamentos/novo" className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">
          Novo lançamento
        </Link>
      </div>

      <Filtros
        contas={contas}
        categorias={categorias}
        atual={Object.fromEntries(
          Object.entries(params).filter(([, v]) => typeof v === 'string'),
        ) as Record<string, string>}
      />

      {resultado.total === 0 && !temFiltro && (
        <SemDados
          titulo="Nenhum lançamento ainda"
          descricao="Registre a primeira despesa ou receita. O saldo das contas passa a refletir isso na hora."
          acao={
            <Link href="/lancamentos/novo" className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">
              Registrar lançamento
            </Link>
          }
        />
      )}

      {resultado.total === 0 && temFiltro && <SemResultados />}

      {resultado.total > 0 && (
        <>
          <p className="text-sm text-slate-600">
            {resultado.total} {resultado.total === 1 ? 'lançamento' : 'lançamentos'}
          </p>

          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {resultado.itens.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <Link href={`/lancamentos/${item.id}`} className="font-medium hover:underline">
                    {/* React escapa por padrão; o texto vem do usuário e é
                        tratado como não confiável (§5.3). */}
                    {item.description}
                  </Link>
                  <p className="text-sm text-slate-600">
                    {dataCurta(item.competenceDate)} · {nomeConta.get(item.accountId) ?? 'Conta'}
                    {item.categoryId && ` · ${nomeCategoria.get(item.categoryId) ?? 'Categoria'}`}
                    {item.kind === 'transferencia' && ' · Transferência'}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <StatusBadge status={item.status} atrasado={estaAtrasado(item, hoje)} />
                  <span
                    className={`tabular-nums ${item.direction === 1 ? 'text-emerald-800' : 'text-slate-900'}`}
                  >
                    {item.direction === 1 ? '+' : '−'} {dinheiro(item.amountCents)}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {totalPaginas > 1 && (
            <nav aria-label="Paginação" className="flex items-center justify-between text-sm">
              {pagina > 1 ? (
                <Link
                  href={{ pathname: '/lancamentos', query: { ...params, pagina: pagina - 1 } }}
                  className="underline"
                >
                  Anterior
                </Link>
              ) : (
                <span />
              )}
              <span>Página {pagina} de {totalPaginas}</span>
              {pagina < totalPaginas ? (
                <Link
                  href={{ pathname: '/lancamentos', query: { ...params, pagina: pagina + 1 } }}
                  className="underline"
                >
                  Próxima
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </section>
  )
}
```

O sinal antes do valor usa `−` (menos matemático) e não hífen, porque o leitor de tela o anuncia como "menos" em vez de "traço".

- [ ] **Step 5: Verificar no navegador**

Run: `npm run dev`
Expected: `/lancamentos` lista, filtra e pagina; um lançamento previsto e vencido aparece com o selo "Atrasado" sem que nada tenha sido gravado como atrasado.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/lancamentos" tests/integration/lista-lancamentos.test.ts
git commit -m "feat(ui): lista de lançamentos com filtros na URL

Filtro vira parâmetro de busca: recarregar não perde, o link pode ser
guardado e Voltar funciona. Atrasado é calculado na leitura."
```

---

### Task 22: Registrar, editar, estornar e desfazer

**Files:**
- Create: `src/app/(app)/lancamentos/novo/page.tsx`, `src/app/(app)/lancamentos/[id]/page.tsx`, `src/app/(app)/lancamentos/acoes.ts`, `src/app/(app)/lancamentos/formulario.tsx`
- Test: `tests/integration/acoes-lancamentos.test.ts`

**Interfaces:**
- Consumes: `criarLancamento`, `criarTransferencia`, `estornarLancamento`, `apagarLancamentoPrevisto`, `atualizarStatus`, `buscarLancamento`; `parseBRL`; `isoDate`; `exigirUsuario`; `registrarEvento`.
- Produces: `salvarLancamento(estadoAnterior, formData)`, `estornar(formData)`, `desfazer(formData)`, `marcarLiquidado(formData)`; `interface EstadoFormularioLancamento { erro?: string; campoInvalido?: string; valores?: Record<string, string>; criadoId?: string; podeDesfazer?: boolean }`.

- [ ] **Step 1: Escrever o teste que falha**

`tests/integration/acoes-lancamentos.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, limparBanco, sqlAdmin } from './helpers'
import { criarConta, listarContasComSaldo } from '../../src/data/accounts'
import { criarCategoria } from '../../src/data/categories'
import {
  apagarLancamentoPrevisto,
  buscarLancamento,
  criarLancamento,
  criarTransferencia,
  estornarLancamento,
} from '../../src/data/transactions'
import { isoDate } from '../../src/domain/dates'
import { cents, parseBRL } from '../../src/domain/money'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

async function cenario() {
  const usuario = await criarUsuario()
  const corrente = await criarConta(usuario, {
    name: 'Corrente', type: 'corrente',
    initialBalanceCents: cents(200_000), initialBalanceDate: isoDate('2026-09-01'),
  })
  const poupanca = await criarConta(usuario, {
    name: 'Poupança', type: 'poupanca',
    initialBalanceCents: cents(0), initialBalanceDate: isoDate('2026-09-01'),
  })
  const categoria = await criarCategoria(usuario, { name: 'Mercado', kind: 'despesa' })
  return { usuario, corrente, poupanca, categoria }
}

describe('registrar lançamento', () => {
  it('valor digitado em pt-BR vira centavos', async () => {
    const { usuario, corrente, categoria } = await cenario()

    const lancamento = await criarLancamento(usuario, {
      accountId: corrente.id, categoryId: categoria.id,
      kind: 'despesa', nature: 'variavel', description: 'Feira',
      amountCents: parseBRL('1.234,56'),
      status: 'liquidado',
      competenceDate: isoDate('2026-09-18'), settledDate: isoDate('2026-09-18'),
    })

    expect(lancamento.amountCents).toBe(123_456)
  })

  it('transferência move entre contas sem virar despesa', async () => {
    const { usuario, corrente, poupanca } = await cenario()

    await criarTransferencia(usuario, {
      fromAccountId: corrente.id, toAccountId: poupanca.id,
      amountCents: cents(50_000), description: 'Reserva',
      competenceDate: isoDate('2026-09-18'), settledDate: isoDate('2026-09-18'),
      status: 'liquidado',
    })

    const contas = await listarContasComSaldo(usuario)
    expect(contas.find((c) => c.name === 'Corrente')?.balanceCents).toBe(150_000)
    expect(contas.find((c) => c.name === 'Poupança')?.balanceCents).toBe(50_000)

    const { listarLancamentos } = await import('../../src/data/transactions')
    const { itens } = await listarLancamentos(usuario, {})
    expect(itens.every((i) => i.kind === 'transferencia')).toBe(true)
    expect(itens.every((i) => i.categoryId === null)).toBe(true)
  })
})

describe('desfazer', () => {
  it('apaga o previsto recém-criado', async () => {
    const { usuario, corrente, categoria } = await cenario()

    const lancamento = await criarLancamento(usuario, {
      accountId: corrente.id, categoryId: categoria.id,
      kind: 'despesa', nature: 'variavel', description: 'Engano',
      amountCents: cents(1000), status: 'previsto',
      competenceDate: isoDate('2026-09-18'), settledDate: null,
    })

    await apagarLancamentoPrevisto(usuario, lancamento.id)
    expect(await buscarLancamento(usuario, lancamento.id)).toBeNull()
  })

  it('não apaga o liquidado — sobra estornar', async () => {
    const { usuario, corrente, categoria } = await cenario()

    const lancamento = await criarLancamento(usuario, {
      accountId: corrente.id, categoryId: categoria.id,
      kind: 'despesa', nature: 'variavel', description: 'Pago',
      amountCents: cents(1000), status: 'liquidado',
      competenceDate: isoDate('2026-09-18'), settledDate: isoDate('2026-09-18'),
    })

    await expect(apagarLancamentoPrevisto(usuario, lancamento.id)).rejects.toThrow(/estorno/i)
    expect(await buscarLancamento(usuario, lancamento.id)).not.toBeNull()
  })
})

describe('estornar', () => {
  it('devolve o saldo e deixa os dois registros visíveis', async () => {
    const { usuario, corrente, categoria } = await cenario()

    const original = await criarLancamento(usuario, {
      accountId: corrente.id, categoryId: categoria.id,
      kind: 'despesa', nature: 'variavel', description: 'Valor errado',
      amountCents: cents(99_900), status: 'liquidado',
      competenceDate: isoDate('2026-09-18'), settledDate: isoDate('2026-09-18'),
    })

    await estornarLancamento(usuario, original.id, 'digitei 999 em vez de 99')

    const [conta] = await listarContasComSaldo(usuario)
    expect(conta.balanceCents).toBe(200_000)

    const { listarLancamentos } = await import('../../src/data/transactions')
    const { itens } = await listarLancamentos(usuario, {})
    expect(itens).toHaveLength(2)
    expect(itens.some((i) => i.status === 'estornado')).toBe(true)
  })

  it('exige motivo', async () => {
    const { usuario, corrente, categoria } = await cenario()
    const original = await criarLancamento(usuario, {
      accountId: corrente.id, categoryId: categoria.id,
      kind: 'despesa', nature: 'variavel', description: 'X',
      amountCents: cents(1000), status: 'liquidado',
      competenceDate: isoDate('2026-09-18'), settledDate: isoDate('2026-09-18'),
    })

    await expect(estornarLancamento(usuario, original.id, '   ')).rejects.toThrow(/motivo/i)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar ou passar**

Run: `npm run test:integration -- acoes-lancamentos`
Expected: PASS.

- [ ] **Step 3: Escrever `src/app/(app)/lancamentos/acoes.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import {
  apagarLancamentoPrevisto,
  atualizarStatus,
  criarLancamento,
  criarTransferencia,
  estornarLancamento,
} from '../../../data/transactions'
import { registrarEvento } from '../../../data/audit'
import { exigirUsuario } from '../../../lib/session'
import { isoDate } from '../../../domain/dates'
import { parseBRL } from '../../../domain/money'

const Formulario = z.object({
  kind: z.enum(['receita', 'despesa', 'transferencia', 'ajuste']),
  description: z.string().trim().min(1, 'Informe uma descrição'),
  valor: z.string().min(1, 'Informe o valor'),
  competenceDate: z.string().min(1, 'Informe a data'),
  status: z.enum(['previsto', 'pendente', 'liquidado']),
  settledDate: z.string().optional(),
  accountId: z.string().uuid('Escolha a conta').optional(),
  toAccountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional().or(z.literal('')),
  nature: z.enum(['fixa', 'variavel']).optional(),
  counterparty: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  adjustmentReason: z.string().trim().optional(),
})

export interface EstadoFormularioLancamento {
  erro?: string
  campoInvalido?: string
  valores?: Record<string, string>
  criadoId?: string
  podeDesfazer?: boolean
}

export async function salvarLancamento(
  _anterior: EstadoFormularioLancamento,
  formData: FormData,
): Promise<EstadoFormularioLancamento> {
  const usuario = await exigirUsuario()
  const bruto = Object.fromEntries(formData) as Record<string, string>

  const analise = Formulario.safeParse(bruto)
  if (!analise.success) {
    const problema = analise.error.issues[0]
    return { erro: problema.message, campoInvalido: String(problema.path[0]), valores: bruto }
  }
  const d = analise.data

  let amountCents
  let competenceDate
  let settledDate = null
  try {
    amountCents = parseBRL(d.valor)
    competenceDate = isoDate(d.competenceDate)
    if (d.status === 'liquidado') {
      settledDate = isoDate(d.settledDate || d.competenceDate)
    }
  } catch (erro) {
    return {
      erro: erro instanceof Error ? erro.message : 'Valor ou data inválidos',
      campoInvalido: 'valor',
      valores: bruto,
    }
  }

  if (amountCents <= 0) {
    return { erro: 'O valor precisa ser maior que zero.', campoInvalido: 'valor', valores: bruto }
  }

  try {
    if (d.kind === 'transferencia') {
      if (!d.accountId || !d.toAccountId) {
        return { erro: 'Escolha a conta de origem e a de destino.', campoInvalido: 'toAccountId', valores: bruto }
      }
      if (d.accountId === d.toAccountId) {
        return { erro: 'Origem e destino precisam ser contas diferentes.', campoInvalido: 'toAccountId', valores: bruto }
      }

      await criarTransferencia(usuario.id, {
        fromAccountId: d.accountId,
        toAccountId: d.toAccountId,
        amountCents,
        description: d.description,
        competenceDate,
        settledDate,
        status: d.status,
        notes: d.notes || null,
      })

      await registrarEvento(usuario.id, {
        eventType: 'transferencia.criada', objectType: 'transaction',
        source: 'usuario', result: 'sucesso',
      })

      revalidatePath('/lancamentos')
      revalidatePath('/')
      redirect('/lancamentos')
    }

    if (!d.accountId) {
      return { erro: 'Escolha a conta.', campoInvalido: 'accountId', valores: bruto }
    }

    const lancamento = await criarLancamento(usuario.id, {
      accountId: d.accountId,
      categoryId: d.kind === 'ajuste' ? null : d.categoryId || null,
      kind: d.kind,
      nature: d.kind === 'receita' || d.kind === 'despesa' ? (d.nature ?? 'variavel') : null,
      description: d.description,
      counterparty: d.counterparty || null,
      notes: d.notes || null,
      amountCents,
      direction: d.kind === 'ajuste' ? 1 : undefined,
      status: d.status,
      competenceDate,
      settledDate,
      adjustmentReason: d.kind === 'ajuste' ? d.adjustmentReason || null : null,
    })

    await registrarEvento(usuario.id, {
      eventType: 'lancamento.criado', objectType: 'transaction', objectId: lancamento.id,
      source: 'usuario', result: 'sucesso',
    })

    revalidatePath('/lancamentos')
    revalidatePath('/')

    // Desfazer só existe enquanto o lançamento não moveu saldo. Depois de
    // liquidado, a correção é estorno (§5.3).
    return {
      criadoId: lancamento.id,
      podeDesfazer: lancamento.status === 'previsto' || lancamento.status === 'pendente',
    }
  } catch (erro) {
    return {
      erro: erro instanceof Error ? erro.message : 'Não foi possível salvar o lançamento.',
      valores: bruto,
    }
  }
}

export async function desfazer(formData: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  const id = String(formData.get('id'))

  await apagarLancamentoPrevisto(usuario.id, id)
  await registrarEvento(usuario.id, {
    eventType: 'lancamento.desfeito', objectType: 'transaction', objectId: id,
    source: 'usuario', result: 'sucesso',
  })

  revalidatePath('/lancamentos')
  revalidatePath('/')
}

export async function estornar(formData: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  const id = String(formData.get('id'))
  const motivo = String(formData.get('motivo') ?? '')

  await estornarLancamento(usuario.id, id, motivo)
  await registrarEvento(usuario.id, {
    eventType: 'lancamento.estornado', objectType: 'transaction', objectId: id,
    source: 'usuario', result: 'sucesso',
  })

  revalidatePath('/lancamentos')
  revalidatePath('/')
  redirect('/lancamentos')
}

export async function marcarLiquidado(formData: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  const id = String(formData.get('id'))
  const quando = isoDate(String(formData.get('quando')))

  await atualizarStatus(usuario.id, id, 'liquidado', quando)
  await registrarEvento(usuario.id, {
    eventType: 'lancamento.liquidado', objectType: 'transaction', objectId: id,
    source: 'usuario', result: 'sucesso',
  })

  revalidatePath('/lancamentos')
  revalidatePath('/')
}
```

- [ ] **Step 4: Escrever `src/app/(app)/lancamentos/formulario.tsx`**

```tsx
'use client'

import { useActionState, useState } from 'react'
import { desfazer, salvarLancamento, type EstadoFormularioLancamento } from './acoes'
import { ToastDesfazer } from '../../../components/toast'
import type { Conta } from '../../../data/accounts'
import type { Categoria } from '../../../data/categories'
import type { TransactionKind } from '../../../domain/types'

const TIPOS: { valor: TransactionKind; rotulo: string }[] = [
  { valor: 'despesa', rotulo: 'Despesa' },
  { valor: 'receita', rotulo: 'Receita' },
  { valor: 'transferencia', rotulo: 'Transferência' },
  { valor: 'ajuste', rotulo: 'Ajuste de saldo' },
]

const INICIAL: EstadoFormularioLancamento = {}

export function FormularioLancamento({
  contas,
  categorias,
}: {
  contas: Conta[]
  categorias: Categoria[]
}) {
  const [estado, acao, enviando] = useActionState(salvarLancamento, INICIAL)
  const [tipo, setTipo] = useState<TransactionKind>('despesa')
  const [status, setStatus] = useState('liquidado')
  const v = estado.valores ?? {}

  const ehTransferencia = tipo === 'transferencia'
  const ehAjuste = tipo === 'ajuste'
  const aceitaCategoria = !ehTransferencia && !ehAjuste

  return (
    <>
      <form action={acao} className="max-w-lg space-y-4">
        {estado.erro && (
          <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <span aria-hidden="true">⚠ </span>
            {estado.erro}
          </p>
        )}

        <fieldset>
          <legend className="text-sm font-medium">Tipo</legend>
          <div className="mt-2 flex flex-wrap gap-4">
            {TIPOS.map((opcao) => (
              <label key={opcao.valor} className="flex items-center gap-2 text-sm">
                <input
                  type="radio" name="kind" value={opcao.valor}
                  checked={tipo === opcao.valor}
                  onChange={() => setTipo(opcao.valor)}
                />
                {opcao.rotulo}
              </label>
            ))}
          </div>
          {ehTransferencia && (
            <p className="mt-2 text-xs text-slate-500">
              Transferência move dinheiro entre contas suas. Não é receita nem despesa, e por isso
              não leva categoria.
            </p>
          )}
        </fieldset>

        <div>
          <label htmlFor="description" className="block text-sm font-medium">Descrição</label>
          <input
            id="description" name="description" required
            autoFocus={estado.campoInvalido === 'description'}
            defaultValue={v.description ?? ''}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="valor" className="block text-sm font-medium">Valor</label>
            <input
              id="valor" name="valor" inputMode="decimal" placeholder="0,00" required
              autoFocus={estado.campoInvalido === 'valor'}
              defaultValue={v.valor ?? ''}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
            <p className="mt-1 text-xs text-slate-500">Sempre positivo. O tipo define o efeito.</p>
          </div>

          <div>
            <label htmlFor="competenceDate" className="block text-sm font-medium">Data</label>
            <input
              id="competenceDate" name="competenceDate" type="date" required
              defaultValue={v.competenceDate ?? ''}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </div>
        </div>

        <div>
          <label htmlFor="accountId" className="block text-sm font-medium">
            {ehTransferencia ? 'Conta de origem' : 'Conta'}
          </label>
          <select
            id="accountId" name="accountId" required defaultValue={v.accountId ?? ''}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="">Escolha…</option>
            {contas.map((conta) => (
              <option key={conta.id} value={conta.id}>{conta.name}</option>
            ))}
          </select>
        </div>

        {ehTransferencia && (
          <div>
            <label htmlFor="toAccountId" className="block text-sm font-medium">Conta de destino</label>
            <select
              id="toAccountId" name="toAccountId" required defaultValue={v.toAccountId ?? ''}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            >
              <option value="">Escolha…</option>
              {contas.map((conta) => (
                <option key={conta.id} value={conta.id}>{conta.name}</option>
              ))}
            </select>
          </div>
        )}

        {aceitaCategoria && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="categoryId" className="block text-sm font-medium">Categoria</label>
              <select
                id="categoryId" name="categoryId" defaultValue={v.categoryId ?? ''}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              >
                <option value="">Sem categoria</option>
                {categorias
                  .filter((categoria) => categoria.kind === (tipo === 'receita' ? 'receita' : 'despesa'))
                  .map((categoria) => (
                    <option key={categoria.id} value={categoria.id}>{categoria.name}</option>
                  ))}
              </select>
            </div>

            <div>
              <label htmlFor="nature" className="block text-sm font-medium">Natureza</label>
              <select
                id="nature" name="nature" defaultValue={v.nature ?? 'variavel'}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              >
                <option value="variavel">Variável</option>
                <option value="fixa">Fixa</option>
              </select>
            </div>
          </div>
        )}

        {ehAjuste && (
          <div>
            <label htmlFor="adjustmentReason" className="block text-sm font-medium">
              Motivo do ajuste
            </label>
            <input
              id="adjustmentReason" name="adjustmentReason" required
              defaultValue={v.adjustmentReason ?? ''}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
            <p className="mt-1 text-xs text-slate-500">
              Ajuste sem explicação reescreve o histórico em silêncio. O motivo fica registrado.
            </p>
          </div>
        )}

        <div>
          <label htmlFor="status" className="block text-sm font-medium">Situação</label>
          <select
            id="status" name="status" value={status} onChange={(e) => setStatus(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="liquidado">Já pago ou recebido</option>
            <option value="pendente">Pendente</option>
            <option value="previsto">Previsto</option>
          </select>
          {status !== 'liquidado' && (
            <p className="mt-1 text-xs text-slate-500">Não entra no saldo até ser liquidado.</p>
          )}
        </div>

        {status === 'liquidado' && (
          <div>
            <label htmlFor="settledDate" className="block text-sm font-medium">
              Data da liquidação <span className="text-slate-500">(vazio usa a data acima)</span>
            </label>
            <input
              id="settledDate" name="settledDate" type="date"
              defaultValue={v.settledDate ?? ''}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </div>
        )}

        <button
          type="submit" disabled={enviando}
          className="rounded bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {enviando ? 'Salvando…' : 'Salvar lançamento'}
        </button>
      </form>

      {estado.criadoId && (
        <ToastDesfazer
          mensagem="Lançamento registrado."
          aoDesfazer={
            estado.podeDesfazer
              ? () => {
                  const dados = new FormData()
                  dados.set('id', estado.criadoId!)
                  void desfazer(dados)
                }
              : undefined
          }
        />
      )}
    </>
  )
}
```

- [ ] **Step 5: Escrever as páginas**

`src/app/(app)/lancamentos/novo/page.tsx`:

```tsx
import Link from 'next/link'
import { listarContas } from '../../../../data/accounts'
import { listarCategorias } from '../../../../data/categories'
import { exigirUsuario } from '../../../../lib/session'
import { SemDados } from '../../../../components/states'
import { FormularioLancamento } from '../formulario'

export default async function PaginaNovoLancamento() {
  const usuario = await exigirUsuario()
  const [contas, categorias] = await Promise.all([
    listarContas(usuario.id),
    listarCategorias(usuario.id),
  ])

  if (contas.length === 0) {
    return (
      <SemDados
        titulo="Cadastre uma conta primeiro"
        descricao="Todo lançamento pertence a uma conta. Crie a sua para começar a registrar."
        acao={
          <Link href="/contas/nova" className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">
            Cadastrar conta
          </Link>
        }
      />
    )
  }

  return (
    <section>
      <h1 className="mb-6 text-xl font-semibold">Novo lançamento</h1>
      <FormularioLancamento contas={contas} categorias={categorias} />
    </section>
  )
}
```

`src/app/(app)/lancamentos/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { buscarConta } from '../../../../data/accounts'
import { buscarLancamento } from '../../../../data/transactions'
import { hojeEm } from '../../../../domain/dates'
import { estaAtrasado } from '../../../../domain/transaction'
import { exigirUsuario } from '../../../../lib/session'
import { dataLonga, dinheiro } from '../../../../lib/format'
import { StatusBadge } from '../../../../components/status-badge'
import { estornar, marcarLiquidado } from '../acoes'

export default async function PaginaLancamento({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const usuario = await exigirUsuario()
  const lancamento = await buscarLancamento(usuario.id, id)
  if (!lancamento) notFound()

  const conta = await buscarConta(usuario.id, lancamento.accountId)
  const hoje = hojeEm(usuario.timezone)
  const podeLiquidar = lancamento.status === 'previsto' || lancamento.status === 'pendente'
  const podeEstornar = lancamento.status === 'liquidado' || lancamento.status === 'conciliado'

  return (
    <section className="max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{lancamento.description}</h1>
        <div className="mt-2 flex items-center gap-3">
          <StatusBadge status={lancamento.status} atrasado={estaAtrasado(lancamento, hoje)} />
          <span className="tabular-nums">
            {lancamento.direction === 1 ? '+' : '−'} {dinheiro(lancamento.amountCents)}
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-y-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <dt className="text-slate-600">Conta</dt>
        <dd>{conta?.name ?? '—'}</dd>

        <dt className="text-slate-600">Competência</dt>
        <dd>{dataLonga(lancamento.competenceDate)}</dd>

        <dt className="text-slate-600">Liquidação</dt>
        <dd>{lancamento.settledDate ? dataLonga(lancamento.settledDate) : 'Ainda não liquidado'}</dd>

        {lancamento.adjustmentReason && (
          <>
            <dt className="text-slate-600">Motivo do ajuste</dt>
            <dd>{lancamento.adjustmentReason}</dd>
          </>
        )}
      </dl>

      {podeLiquidar && (
        <form action={marcarLiquidado} className="flex items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <input type="hidden" name="id" value={lancamento.id} />
          <div>
            <label htmlFor="quando" className="block text-sm font-medium">Liquidado em</label>
            <input
              id="quando" name="quando" type="date" required defaultValue={hoje}
              className="mt-1 rounded border border-slate-300 px-3 py-2"
            />
          </div>
          <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            Marcar como liquidado
          </button>
        </form>
      )}

      {podeEstornar && (
        <form action={estornar} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <input type="hidden" name="id" value={lancamento.id} />
          <p className="text-sm text-slate-700">
            Lançamento liquidado não é apagado. Corrigir gera um estorno, e os dois registros
            continuam visíveis no histórico.
          </p>
          <div>
            <label htmlFor="motivo" className="block text-sm font-medium">Motivo do estorno</label>
            <input
              id="motivo" name="motivo" required
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </div>
          <button type="submit" className="rounded bg-red-700 px-4 py-2 text-sm font-medium text-white">
            Estornar lançamento
          </button>
        </form>
      )}
    </section>
  )
}
```

- [ ] **Step 6: Rodar e verificar**

Run: `npm run test:integration -- acoes-lancamentos` e `npm run dev`
Expected: PASS nos testes. No navegador: registrar despesa muda o saldo; trocar o tipo para transferência esconde a categoria e pede a segunda conta; criar um previsto mostra o aviso com "Desfazer"; criar um liquidado mostra o aviso **sem** desfazer; a página de um liquidado oferece estorno e exige motivo.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/lancamentos" tests/integration/acoes-lancamentos.test.ts
git commit -m "feat(ui): registrar, liquidar, estornar e desfazer

Um formulário com campos condicionais ao tipo. Desfazer aparece só
enquanto o lançamento não moveu saldo; depois disso a correção é estorno
com motivo, e os dois registros ficam visíveis."
```

---

### Task 23: Conciliar uma conta

**Files:**
- Create: `src/app/(app)/contas/[id]/conciliar/page.tsx`, `src/app/(app)/contas/[id]/conciliar/acoes.ts`, `src/app/(app)/contas/[id]/conciliar/formulario.tsx`
- Test: `tests/integration/acoes-conciliar.test.ts`

**Interfaces:**
- Consumes: `prepararConciliacao`, `registrarConciliacao`; `parseBRL`; `dinheiro`; `exigirUsuario`; `registrarEvento`.
- Produces: `calcularDiferenca(estadoAnterior, formData)`, `confirmarConciliacao(formData)`; `interface EstadoConciliacao { etapa: 'informar' | 'decidir'; erro?: string; reportedTexto?: string; calculatedCents?: number; differenceCents?: number; confere?: boolean; decisoes?: string[] }`.

Duas etapas, de propósito: informar o saldo do extrato não grava nada. O usuário vê a diferença e só então decide. O §5.3.1 exige exatamente isso.

- [ ] **Step 1: Escrever o teste que falha**

`tests/integration/acoes-conciliar.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, limparBanco, sqlAdmin } from './helpers'
import { criarConta, listarContasComSaldo } from '../../src/data/accounts'
import { prepararConciliacao, registrarConciliacao } from '../../src/data/reconciliations'
import { isoDate } from '../../src/domain/dates'
import { cents } from '../../src/domain/money'

beforeEach(limparBanco)
afterAll(() => sqlAdmin.end())

async function conta() {
  const usuario = await criarUsuario()
  const corrente = await criarConta(usuario, {
    name: 'Corrente', type: 'corrente',
    initialBalanceCents: cents(150_000), initialBalanceDate: isoDate('2026-09-01'),
  })
  return { usuario, corrente }
}

describe('fluxo de conciliação', () => {
  it('a prévia não grava nada', async () => {
    const { usuario, corrente } = await conta()

    await prepararConciliacao(usuario, corrente.id, cents(140_000))

    const [registros] = await sqlAdmin<{ total: string }[]>`
      select count(*)::text as total from reconciliations
    `
    expect(Number(registros.total)).toBe(0)

    const [depois] = await listarContasComSaldo(usuario)
    expect(depois.isEstimated).toBe(true)
  })

  it('a decisão de ajuste faz o saldo bater e deixa a trilha', async () => {
    const { usuario, corrente } = await conta()

    await registrarConciliacao(usuario, {
      accountId: corrente.id,
      reportedCents: cents(140_000),
      decision: 'ajuste_criado',
      motivo: 'tarifa de manutenção não lançada',
      quando: isoDate('2026-09-18'),
    })

    const [depois] = await listarContasComSaldo(usuario)
    expect(depois.balanceCents).toBe(140_000)
    expect(depois.isEstimated).toBe(false)

    const [registro] = await sqlAdmin<{ difference_cents: string; decision: string }[]>`
      select difference_cents, decision from reconciliations
    `
    expect(Number(registro.difference_cents)).toBe(-10_000)
    expect(registro.decision).toBe('ajuste_criado')
  })

  it('o ajuste gerado carrega o motivo e é rastreável', async () => {
    const { usuario, corrente } = await conta()

    const resultado = await registrarConciliacao(usuario, {
      accountId: corrente.id,
      reportedCents: cents(160_000),
      decision: 'ajuste_criado',
      motivo: 'depósito antigo não registrado',
      quando: isoDate('2026-09-18'),
    })

    const [ajuste] = await sqlAdmin<{ adjustment_reason: string; direction: number; kind: string }[]>`
      select adjustment_reason, direction, kind from transactions where id = ${resultado.adjustmentTransactionId!}
    `
    expect(ajuste.kind).toBe('ajuste')
    expect(ajuste.direction).toBe(1)
    expect(ajuste.adjustment_reason).toBe('depósito antigo não registrado')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar ou passar**

Run: `npm run test:integration -- acoes-conciliar`
Expected: PASS.

- [ ] **Step 3: Escrever `src/app/(app)/contas/[id]/conciliar/acoes.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prepararConciliacao, registrarConciliacao } from '../../../../../data/reconciliations'
import { registrarEvento } from '../../../../../data/audit'
import { exigirUsuario } from '../../../../../lib/session'
import { hojeEm, isoDate } from '../../../../../domain/dates'
import { parseBRL } from '../../../../../domain/money'
import type { DecisaoConciliacao } from '../../../../../domain/reconciliation'

export interface EstadoConciliacao {
  etapa: 'informar' | 'decidir'
  erro?: string
  reportedTexto?: string
  reportedCents?: number
  calculatedCents?: number
  differenceCents?: number
  confere?: boolean
  decisoes?: DecisaoConciliacao[]
}

/** Etapa 1: calcula e mostra. Nada é gravado. */
export async function calcularDiferenca(
  _anterior: EstadoConciliacao,
  formData: FormData,
): Promise<EstadoConciliacao> {
  const usuario = await exigirUsuario()
  const accountId = String(formData.get('accountId'))
  const texto = String(formData.get('saldoInformado') ?? '')

  let reportedCents
  try {
    reportedCents = parseBRL(texto)
  } catch {
    return { etapa: 'informar', erro: 'Informe o saldo no formato 1.234,56', reportedTexto: texto }
  }

  const previa = await prepararConciliacao(usuario.id, accountId, reportedCents)

  return {
    etapa: 'decidir',
    reportedTexto: texto,
    reportedCents,
    calculatedCents: previa.calculatedCents,
    differenceCents: previa.differenceCents,
    confere: previa.confere,
    decisoes: previa.decisoesPossiveis,
  }
}

/** Etapa 2: grava a decisão do usuário. */
export async function confirmarConciliacao(formData: FormData): Promise<void> {
  const usuario = await exigirUsuario()
  const accountId = String(formData.get('accountId'))
  const decision = String(formData.get('decisao')) as DecisaoConciliacao
  const motivo = String(formData.get('motivo') ?? '')
  const reportedCents = parseBRL(String(formData.get('saldoInformado')))

  await registrarConciliacao(usuario.id, {
    accountId,
    reportedCents,
    decision,
    motivo: motivo || undefined,
    quando: isoDate(hojeEm(usuario.timezone)),
  })

  await registrarEvento(usuario.id, {
    eventType: 'conta.conciliada',
    objectType: 'account',
    objectId: accountId,
    source: 'usuario',
    result: 'sucesso',
  })

  revalidatePath('/contas')
  revalidatePath('/')
  redirect('/contas')
}
```

- [ ] **Step 4: Escrever `src/app/(app)/contas/[id]/conciliar/formulario.tsx`**

```tsx
'use client'

import { useActionState } from 'react'
import {
  calcularDiferenca,
  confirmarConciliacao,
  type EstadoConciliacao,
} from './acoes'
import { dinheiro } from '../../../../../lib/format'
import { cents } from '../../../../../domain/money'

const INICIAL: EstadoConciliacao = { etapa: 'informar' }

const ROTULOS: Record<string, { titulo: string; ajuda: string }> = {
  lancamento_localizado: {
    titulo: 'Vou procurar o lançamento que falta',
    ajuda: 'Fecha a conferência sem alterar nada. Registre o lançamento e concilie de novo.',
  },
  duplicidade_removida: {
    titulo: 'Havia um lançamento repetido e já corrigi',
    ajuda: 'Fecha a conferência sem alterar nada.',
  },
  ajuste_criado: {
    titulo: 'Criar um ajuste com a diferença',
    ajuda: 'Gera um lançamento de ajuste com o motivo que você escrever. Use quando a busca não resolveu.',
  },
  adiado: {
    titulo: 'Deixar para depois',
    ajuda: 'Registra a divergência sem corrigi-la. Ela continua visível.',
  },
}

export function FormularioConciliacao({
  accountId,
  nomeConta,
}: {
  accountId: string
  nomeConta: string
}) {
  const [estado, acao, calculando] = useActionState(calcularDiferenca, INICIAL)

  if (estado.etapa === 'informar') {
    return (
      <form action={acao} className="max-w-lg space-y-4">
        <input type="hidden" name="accountId" value={accountId} />

        {estado.erro && (
          <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <span aria-hidden="true">⚠ </span>
            {estado.erro}
          </p>
        )}

        <div>
          <label htmlFor="saldoInformado" className="block text-sm font-medium">
            Saldo que aparece no extrato de {nomeConta}
          </label>
          <input
            id="saldoInformado" name="saldoInformado" inputMode="decimal" placeholder="0,00" required
            defaultValue={estado.reportedTexto ?? ''}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
          <p className="mt-1 text-xs text-slate-500">
            Nada é alterado agora. Você vê a diferença e decide o que fazer.
          </p>
        </div>

        <button
          type="submit" disabled={calculando}
          className="rounded bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {calculando ? 'Comparando…' : 'Comparar'}
        </button>
      </form>
    )
  }

  return (
    <form action={confirmarConciliacao} className="max-w-lg space-y-5">
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="saldoInformado" value={estado.reportedTexto ?? ''} />

      <dl className="grid grid-cols-2 gap-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <dt className="text-slate-600">Extrato</dt>
        <dd className="text-right tabular-nums">{dinheiro(cents(estado.reportedCents ?? 0))}</dd>

        <dt className="text-slate-600">Sistema</dt>
        <dd className="text-right tabular-nums">{dinheiro(cents(estado.calculatedCents ?? 0))}</dd>

        <dt className="border-t border-slate-200 pt-2 font-medium">Diferença</dt>
        <dd className="border-t border-slate-200 pt-2 text-right font-medium tabular-nums">
          {dinheiro(cents(estado.differenceCents ?? 0))}
        </dd>
      </dl>

      {estado.confere ? (
        <>
          <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <span aria-hidden="true">✓ </span>
            Os valores batem. A conta será marcada como conciliada.
          </p>
          <input type="hidden" name="decisao" value="adiado" />
        </>
      ) : (
        <>
          <p className="text-sm text-slate-700">
            {(estado.differenceCents ?? 0) > 0
              ? 'O extrato tem mais do que o sistema: provavelmente falta registrar uma entrada.'
              : 'O sistema tem mais do que o extrato: provavelmente há um lançamento a mais ou repetido.'}
          </p>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">O que você quer fazer?</legend>
            {(estado.decisoes ?? []).map((decisao) => (
              <label key={decisao} className="flex items-start gap-2 rounded border border-slate-200 p-3 text-sm">
                <input type="radio" name="decisao" value={decisao} required className="mt-1" />
                <span>
                  <span className="font-medium">{ROTULOS[decisao].titulo}</span>
                  <span className="block text-xs text-slate-600">{ROTULOS[decisao].ajuda}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div>
            <label htmlFor="motivo" className="block text-sm font-medium">
              Motivo <span className="text-slate-500">(obrigatório se escolher criar ajuste)</span>
            </label>
            <input
              id="motivo" name="motivo"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </div>
        </>
      )}

      <button type="submit" className="rounded bg-slate-900 px-4 py-2 font-medium text-white">
        Confirmar conciliação
      </button>
    </form>
  )
}
```

- [ ] **Step 5: Escrever `src/app/(app)/contas/[id]/conciliar/page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import { buscarConta } from '../../../../../data/accounts'
import { exigirUsuario } from '../../../../../lib/session'
import { FormularioConciliacao } from './formulario'

export default async function PaginaConciliar({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const usuario = await exigirUsuario()
  const conta = await buscarConta(usuario.id, id)
  if (!conta) notFound()

  return (
    <section>
      <h1 className="text-xl font-semibold">Conciliar {conta.name}</h1>
      <p className="mb-6 mt-1 max-w-lg text-sm text-slate-600">
        Conferir o saldo com o extrato tira o aviso de estimado. Uma divergência nunca é corrigida
        sozinha: você vê a diferença e escolhe o que fazer.
      </p>
      <FormularioConciliacao accountId={conta.id} nomeConta={conta.name} />
    </section>
  )
}
```

- [ ] **Step 6: Verificar no navegador**

Run: `npm run dev`
Expected: informar o saldo exato marca a conta como conciliada e o `≈` some da tela de saldos; informar um saldo diferente mostra a diferença com as quatro opções, e escolher ajuste sem motivo é recusado.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/contas/[id]/conciliar" tests/integration/acoes-conciliar.test.ts
git commit -m "feat(ui): conciliação em duas etapas

Informar o extrato não grava nada: o usuário vê a diferença e decide.
Procurar o lançamento que falta vem antes de criar ajuste, e o ajuste
exige motivo — §5.3.1 proíbe reescrever histórico em silêncio."
```

---

### Task 24: Configurações, backup e verificação final

**Files:**
- Create: `src/app/(app)/configuracoes/page.tsx`, `src/app/(app)/configuracoes/acoes.ts`, `scripts/backup.sh`, `scripts/restore-test.sh`, `docs/seguranca/backup-e-restauracao.md`
- Modify: `docs/seguranca/modelo-de-ameacas.md` (marcar o que virou teste)

**Interfaces:**
- Consumes: `atualizarPreferencias`, `encerrarTodasSessoes`, `exigirUsuario`, `sair`.
- Produces: `salvarPreferencias(estadoAnterior, formData)`, `encerrarOutrasSessoes()`.

- [ ] **Step 1: Escrever `src/app/(app)/configuracoes/acoes.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { atualizarPreferencias } from '../../../data/users'
import { encerrarTodasSessoes } from '../../../data/sessions'
import { registrarEvento } from '../../../data/audit'
import { exigirUsuario, limparCookieSessao } from '../../../lib/session'
import { redirect } from 'next/navigation'

const Preferencias = z.object({
  displayName: z.string().trim().min(1, 'Informe seu nome'),
  timezone: z.string().trim().min(1, 'Informe o fuso horário'),
  monthStartDay: z.coerce.number().int().min(1, 'Entre 1 e 31').max(31, 'Entre 1 e 31'),
})

export interface EstadoPreferencias {
  erro?: string
  sucesso?: boolean
}

export async function salvarPreferencias(
  _anterior: EstadoPreferencias,
  formData: FormData,
): Promise<EstadoPreferencias> {
  const usuario = await exigirUsuario()
  const analise = Preferencias.safeParse(Object.fromEntries(formData))

  if (!analise.success) {
    return { erro: analise.error.issues[0].message }
  }

  await atualizarPreferencias(usuario.id, analise.data)
  await registrarEvento(usuario.id, {
    eventType: 'preferencias.atualizadas',
    source: 'usuario',
    result: 'sucesso',
  })

  revalidatePath('/configuracoes')
  return { sucesso: true }
}

/** Revogação de dispositivos, exigida pelo §11. */
export async function encerrarOutrasSessoes(): Promise<void> {
  const usuario = await exigirUsuario()

  await encerrarTodasSessoes(usuario.id)
  await registrarEvento(usuario.id, {
    eventType: 'sessoes.revogadas',
    source: 'usuario',
    result: 'sucesso',
  })

  await limparCookieSessao()
  redirect('/entrar')
}
```

- [ ] **Step 2: Escrever `src/app/(app)/configuracoes/page.tsx`**

```tsx
import { exigirUsuario } from '../../../lib/session'
import { sair } from '../../entrar/acoes'
import { encerrarOutrasSessoes } from './acoes'

const FUSOS = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Belem',
  'America/Cuiaba',
  'America/Rio_Branco',
  'America/Noronha',
]

export default async function PaginaConfiguracoes() {
  const usuario = await exigirUsuario()

  return (
    <section className="max-w-lg space-y-8">
      <h1 className="text-xl font-semibold">Configurações</h1>

      <form action={async (formData) => {
        'use server'
        const { salvarPreferencias } = await import('./acoes')
        await salvarPreferencias({}, formData)
      }} className="space-y-4">
        <div>
          <label htmlFor="displayName" className="block text-sm font-medium">Nome</label>
          <input
            id="displayName" name="displayName" required defaultValue={usuario.displayName}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>

        <div>
          <label htmlFor="timezone" className="block text-sm font-medium">Fuso horário</label>
          <select
            id="timezone" name="timezone" defaultValue={usuario.timezone}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          >
            {FUSOS.map((fuso) => (
              <option key={fuso} value={fuso}>{fuso}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Define qual é "hoje" para vencimentos e lançamentos.
          </p>
        </div>

        <div>
          <label htmlFor="monthStartDay" className="block text-sm font-medium">
            Dia em que seu mês financeiro começa
          </label>
          <input
            id="monthStartDay" name="monthStartDay" type="number" min={1} max={31}
            defaultValue={usuario.monthStartDay}
            className="mt-1 w-32 rounded border border-slate-300 px-3 py-2"
          />
          <p className="mt-1 text-xs text-slate-500">
            Use o dia do salário se preferir que o período acompanhe sua renda.
          </p>
        </div>

        <button type="submit" className="rounded bg-slate-900 px-4 py-2 font-medium text-white">
          Salvar
        </button>
      </form>

      <div className="space-y-3 border-t border-slate-200 pt-6">
        <h2 className="text-sm font-medium">Sessões</h2>
        <form action={sair}>
          <button type="submit" className="rounded border border-slate-300 px-4 py-2 text-sm">
            Sair deste dispositivo
          </button>
        </form>
        <form action={encerrarOutrasSessoes}>
          <button type="submit" className="rounded border border-red-300 px-4 py-2 text-sm text-red-800">
            Encerrar todas as sessões
          </button>
          <p className="mt-1 text-xs text-slate-500">
            Desconecta todos os dispositivos, inclusive este.
          </p>
        </form>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Escrever `scripts/backup.sh`**

```bash
#!/usr/bin/env bash
# Backup cifrado do banco. A chave nunca entra no repositório.
#
# Uso:  MT_BACKUP_PASSPHRASE='...' ./scripts/backup.sh
# Saída: backups/money-tree-AAAA-MM-DDTHHMMSS.sql.gz.enc (ignorado pelo Git)

set -euo pipefail

: "${MIGRATION_DATABASE_URL:?defina MIGRATION_DATABASE_URL}"
: "${MT_BACKUP_PASSPHRASE:?defina MT_BACKUP_PASSPHRASE}"

destino="backups"
mkdir -p "$destino"
arquivo="$destino/money-tree-$(date -u +%Y-%m-%dT%H%M%S).sql.gz.enc"

# AES-256-GCM via openssl: criptografia autenticada, como o §11 exige.
# pbkdf2 com iterações altas para derivar a chave da frase secreta.
pg_dump --no-owner --no-privileges "$MIGRATION_DATABASE_URL" \
  | gzip -9 \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt \
      -pass env:MT_BACKUP_PASSPHRASE \
      -out "$arquivo"

echo "Backup criado: $arquivo"
echo "Tamanho: $(du -h "$arquivo" | cut -f1)"
echo
echo "AVISO: sem a frase secreta este arquivo é irrecuperável."
echo "Guarde a frase em gerenciador de senhas, nunca no repositório."
```

`openssl enc` com CBC não é autenticado. Se a versão do OpenSSL disponível suportar `-aes-256-gcm` em `enc`, prefira-a; caso contrário, use `age` (`age -p`), que é autenticado por padrão e mais simples de operar. Registre no documento de backup qual das duas foi usada.

- [ ] **Step 4: Escrever `scripts/restore-test.sh`**

```bash
#!/usr/bin/env bash
# Prova que o backup restaura. O §17 trata restauração testada como
# critério de sucesso, não como intenção.
#
# Uso: MT_BACKUP_PASSPHRASE='...' ./scripts/restore-test.sh backups/arquivo.sql.gz.enc

set -euo pipefail

arquivo="${1:?informe o arquivo de backup}"
: "${MT_BACKUP_PASSPHRASE:?defina MT_BACKUP_PASSPHRASE}"

banco_teste="money_tree_restore_test"
url_local="postgresql://postgres:postgres@localhost:55432"

echo "Subindo Postgres local…"
docker compose -f docker-compose.test.yml up -d --wait

psql "$url_local/postgres" -c "drop database if exists $banco_teste;"
psql "$url_local/postgres" -c "create database $banco_teste;"

echo "Restaurando…"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 \
  -pass env:MT_BACKUP_PASSPHRASE -in "$arquivo" \
  | gunzip \
  | psql --quiet "$url_local/$banco_teste"

echo "Conferindo…"
psql "$url_local/$banco_teste" -tAc "
  select
    (select count(*) from users)        as usuarios,
    (select count(*) from accounts)     as contas,
    (select count(*) from transactions) as lancamentos;
"

# A conferência mais importante: o saldo restaurado bate com o original?
psql "$url_local/$banco_teste" -tAc "
  select a.name, b.balance_cents
  from accounts a join account_balances b on b.account_id = a.id
  order by a.name;
"

echo
echo "Restauração concluída. Compare os saldos acima com os do sistema."
echo "Se conferirem, anote a data em docs/seguranca/backup-e-restauracao.md."
```

- [ ] **Step 5: Escrever `docs/seguranca/backup-e-restauracao.md`**

```markdown
# Backup e restauração

## Como criar um backup

```bash
export MT_BACKUP_PASSPHRASE='<frase longa, do gerenciador de senhas>'
./scripts/backup.sh
```

O arquivo vai para `backups/`, que o `.gitignore` bloqueia. Guarde-o fora
do repositório e fora da máquina — um backup que mora no mesmo disco do
banco não protege contra perda do disco.

## Como testar a restauração

```bash
export MT_BACKUP_PASSPHRASE='<a mesma frase>'
./scripts/restore-test.sh backups/<arquivo>
```

O script restaura num Postgres local descartável e imprime os saldos. Se
eles conferirem com os do sistema, o backup está bom.

## A chave

A frase secreta nunca entra no repositório, em variável de ambiente
persistida nem em log. Guardar em gerenciador de senhas.

**Perder a frase torna o backup irrecuperável.** Não existe recuperação, e
isso é a intenção: um backup que alguém pode abrir sem a chave não protege
nada.

## Registro de restaurações testadas

| Data | Arquivo | Resultado |
|---|---|---|
| | | |

Anote cada teste aqui. Backup nunca testado é backup que não existe.
```

- [ ] **Step 6: Tornar os scripts executáveis e testar o ciclo**

```bash
chmod +x scripts/backup.sh scripts/restore-test.sh
export MT_BACKUP_PASSPHRASE='frase-de-teste-longa-o-bastante'
./scripts/backup.sh
./scripts/restore-test.sh backups/$(ls -t backups | head -1)
```

Expected: o backup é criado, a restauração roda e os saldos impressos batem com os de `/contas`. Anote a data na tabela do documento.

- [ ] **Step 7: Rodar tudo e conferir os critérios de pronto**

```bash
npm run lint
npm test
npm run test:integration
npm run build
```

Expected: tudo passa. Depois, confira à mão cada item dos **Critérios de pronto** da spec (seção 11):

1. Entrar, cadastrar conta, registrar os quatro tipos de lançamento.
2. Saldo por conta e total conferem com o razão e indicam quando são estimados.
3. Transferência cria dois lados e não altera o total.
4. Liquidado não pode ser apagado; corrigir gera estorno vinculado.
5. Conciliar mostra a diferença e exige decisão.
6. As quatro invariantes passam em teste de propriedade.
7. Os testes de constraint provam que o banco rejeita dado inválido.
8. RLS bloqueia acesso cruzado, comprovado por teste.
9. Nenhum valor ou descrição aparece em log ou em `audit_events`.
10. Telas passam em teclado, contraste e leitor de tela.
11. Modelo de ameaças escrito, cada mitigação com teste ou procedimento.
12. Restauração de backup executada com sucesso.

Para o item 10, com o servidor rodando:

- Percorra `/`, `/contas`, `/lancamentos/novo` e `/contas/[id]/conciliar` **só com Tab**. Todo controle precisa ser alcançável e ter foco visível.
- Amplie para 200% (`Ctrl` e `+` quatro vezes). Nenhum valor pode sumir ou ficar cortado.
- No DevTools, use a auditoria de acessibilidade do Lighthouse. Alvo: 100, sem erro de contraste.
- Ative o leitor de tela do sistema e confira que os selos de estado são anunciados com texto, não só por cor.

- [ ] **Step 8: Atualizar o modelo de ameaças**

Em `docs/seguranca/modelo-de-ameacas.md`, na coluna Verificação, troque a descrição do teste pelo caminho do arquivo que o implementa. Exemplo: T3 passa a apontar `tests/integration/001-base.test.ts` e `tests/integration/with-user.test.ts`.

As ameaças sem teste automatizado — T14 e T15, riscos aceitos — ficam marcadas como **risco aceito**, sem fingir cobertura.

- [ ] **Step 9: Commit final**

```bash
git add "src/app/(app)/configuracoes" scripts docs
git commit -m "feat: configurações, backup cifrado e restauração testada

O script de restauração imprime os saldos restaurados para comparação: um
backup que restaura mas traz saldo errado é pior do que nenhum. O modelo
de ameaças agora aponta o arquivo de teste de cada mitigação, e as duas
ameaças sem cobertura ficam marcadas como risco aceito em vez de fingir
proteção."
```

---

## Depois desta fatia

Na ordem, cada uma com sua própria spec e seu próprio plano:

1. **Recorrências** — ocorrências previstas geradas automaticamente, calendário, detecção a partir do histórico.
2. **Orçamentos** — envelope como padrão, ritmo esperado, previsão de estouro.
3. **Metas** — reserva virtual contra dinheiro segregado, sem dupla contagem.
4. **Dinheiro livre e dashboard** — a fórmula do §6.2, com a explicação do cálculo aberta ao lado.
5. **Gráficos** — com alternativa textual e distinção visível entre dado real e projeção.

O schema desta fatia comporta as cinco sem migração destrutiva.
