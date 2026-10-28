# Money Tree — Fatia 4 (Metas): Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** metas com reserva (alocações) sem dupla contagem, contribuição necessária, mês provável, opções quando o prazo não fecha e simulação.

**Spec:** `docs/superpowers/specs/2026-10-28-money-tree-metas-design.md` (aprovada com as oito recomendações da seção 11).

**Architecture:** igual às fatias anteriores. Cálculo em `src/domain/goal.ts`, puro; SQL em `src/data/goals.ts`; o banco garante dono, sinal do movimento, reserva nunca negativa e aporte limitado ao saldo não reservado.

**Tech Stack:** Next.js 15 (App Router, server actions), `postgres` (porsager), node-pg-migrate, zod, vitest + fast-check, embedded-postgres nos testes de integração.

## Global Constraints

Valem as das fatias 1, 2 e 3. Mais estas:

- **Centavos inteiros** em todo cálculo (`Cents`, `src/domain/money.ts`); arredondamento da contribuição necessária **para cima**.
- **Mês financeiro** (`mesFinanceiro`, `month_start_day`) é a unidade de contribuição e de mês provável. Reaproveitar `periodosEntre`, `proximoPeriodo`, `periodoAnterior` de `src/domain/budget.ts`.
- **Forma da reserva vem da conta:** `include_in_available = true` ⇒ virtual (desconta uma vez); `false` ⇒ segregada (não desconta).
- **`goal_allocations` é só inserção.** Corrigir é movimento oposto.
- **Nada aplicado sozinho:** opções de prazo só pré-preenchem o formulário; concluir é ação da pessoa.
- **Sem valor nem nome de meta** em log ou `audit_events`.
- Situação sempre com **ícone e texto**; barras com `role="meter"` e `aria-valuetext`.
- Antes de cada task, ler o equivalente da fatia 3 (`migrations/010_orcamentos.sql`, `src/domain/budget.ts`, `src/data/budgets.ts`, `src/app/(app)/orcamentos/*`, testes `tests/unit/budget*.test.ts`, `tests/integration/010-orcamentos.test.ts`, `repo-budgets.test.ts`) e copiar o estilo: comentários em português explicando o porquê, nomes em português, `withUser` para RLS.

## Estrutura de arquivos

```
migrations/011_metas.sql
src/domain/goal.ts
src/data/goals.ts
src/app/(app)/metas/page.tsx, nova/page.tsx, [id]/page.tsx, [id]/editar/page.tsx, acoes.ts, formulario.tsx
src/components/metas-resumo.tsx          cartão da tela inicial
tests/unit/goal.test.ts, goal-avaliacao.test.ts
tests/integration/011-metas.test.ts, repo-goals.test.ts
```

## Ordem das tarefas

Domínio (1–2), banco (3), dados (4), interface (5–6), verificação e segurança (7). Tasks 1–2 e 3 são independentes; 4 depende de 1–3; 5–6 dependem de 4.

---

### Task 1: Domínio — progresso, meses, necessária, ritmo e desconto

**Files:** create `src/domain/goal.ts`; test `tests/unit/goal.test.ts`.

**Interfaces (Produces):**

```ts
export type GoalKind = 'reserva_emergencia' | 'viagem' | 'compra' | 'quitacao_divida' | 'educacao' | 'longo_prazo' | 'livre'
export type GoalPriority = 'alta' | 'media' | 'baixa'
export type AllocationKind = 'aporte' | 'resgate' | 'liberacao'

export interface Movimento { amountCents: Cents; kind: AllocationKind; occurredOn: IsoDate; accountId: string }

export function progresso(alvo: Cents, reservado: Cents): { falta: Cents; percentual: number; atingida: boolean }
/** Períodos do atual (que contém `hoje`) até o último com inicio <= dataAlvo; 0 se dataAlvo < hoje. */
export function mesesRestantes(hoje: IsoDate, dataAlvo: IsoDate, diaInicio: number): number
export function contribuicaoNecessaria(falta: Cents, meses: number): Cents | null   // null se meses <= 0
export type Ritmo = { origem: 'planejado' | 'media'; valor: Cents } | null
export function ritmo(planejado: Cents | null, movimentos: Movimento[], hoje: IsoDate, diaInicio: number): Ritmo
export function mesProvavel(falta: Cents, ritmo: Ritmo, hoje: IsoDate, diaInicio: number): Periodo | null
export function reservaParaDesconto(reservasPorConta: Map<string, Cents>, contas: { id: string; includeInAvailable: boolean }[]): Cents
```

Notas:
- `mesesRestantes`: data-alvo dentro do período atual ⇒ 1; data-alvo antes de `hoje` ⇒ 0 (prazo vencido).
- `ritmo`: planejado > 0 vence; senão média dos movimentos `aporte`+`resgate` (sem `liberacao`) dos **três últimos períodos completos** (antes do atual), dividida por 3, truncada; ≤ 0 ⇒ `null`.
- `mesProvavel`: falta = 0 ⇒ período atual; ritmo nulo ⇒ `null`; senão período atual + `ceil(falta/ritmo) − 1`.

**Testes:** `month_start_day` 1 e 5; data-alvo no período atual; data passada ⇒ 0; média com resgates e ignorando `liberacao`; movimento do período atual fora da média; ritmo negativo ⇒ null. Propriedades (fast-check): invariante 2 (`necessaria × meses ≥ falta` e `(necessaria − 1) × meses < falta`), 3 (contribuição maior ⇒ mês provável não posterior), 6 (percentual em [0,100], falta ≥ 0), 1 (`reservaParaDesconto` = soma das incluídas; alterar reserva de excluída não muda).

**Commit:** `feat(domain): progresso, contribuição necessária e ritmo das metas`

---

### Task 2: Domínio — situação, opções de prazo e simulação

**Files:** modify `src/domain/goal.ts`; test `tests/unit/goal-avaliacao.test.ts`.

**Interfaces (Produces):**

```ts
export type SituacaoMeta = 'atingida' | 'prazo_vencido' | 'fora_do_prazo' | 'no_prazo' | 'sem_prazo'
export interface OpcoesPrazo {
  aumentarContribuicao: Cents | null   // = necessaria; null com prazo vencido
  reduzirAlvo: Cents | null            // = reservado + ritmo × meses; sem ritmo = reservado; null com prazo vencido
  mudarData: IsoDate | null            // = fim do mesProvavel; null sem ritmo
}
export interface AvaliacaoMeta {
  falta: Cents; percentual: number; atingida: boolean
  mesesRestantes: number | null; necessaria: Cents | null
  ritmo: Ritmo; mesProvavel: Periodo | null
  situacao: SituacaoMeta
  faltariaNaData: Cents | null          // falta − ritmo × meses, quando fora do prazo
  mesesDeAtraso: number | null
  opcoes: OpcoesPrazo | null            // só quando fora_do_prazo ou prazo_vencido
}
export function avaliarMeta(e: { alvo: Cents; reservado: Cents; dataAlvo: IsoDate | null; planejado: Cents | null; movimentos: Movimento[]; hoje: IsoDate; diaInicio: number }): AvaliacaoMeta
export function simular(e: { alvo: Cents; reservado: Cents; dataAlvo: IsoDate | null; hoje: IsoDate; diaInicio: number }, contribuicao: Cents): { mesProvavel: Periodo | null; mesesDeDiferenca: number | null; faltariaNaData: Cents | null }
```

Regras de situação (spec 6.4, 6.7), em ordem: atingida; prazo vencido (data < hoje e falta > 0); fora do prazo (sem ritmo e falta > 0, ou fim do mês provável > data-alvo); no prazo; sem prazo (sem data).

**Testes:** cada situação nas bordas (mês provável terminando exatamente na data-alvo ⇒ no prazo); opções ausentes conforme regras; simulação não depende de movimentos. Propriedade 5: para meta fora do prazo, reavaliar com `planejado = aumentarContribuicao`, ou com `alvo = reduzirAlvo` e `planejado = ritmo`, ou com `dataAlvo = mudarData`, dá situação diferente de `fora_do_prazo`.

**Commit:** `feat(domain): situação, opções de prazo e simulação das metas`

---

### Task 3: Migração 011

**Files:** create `migrations/011_metas.sql`; test `tests/integration/011-metas.test.ts`.

Conteúdo (spec seção 4):
- Enums `goal_kind`, `goal_priority`, `allocation_kind`.
- `goals` com `unique (id, user_id)`, FK composta opcional `(account_id, user_id) → accounts (id, user_id)`, checks: nome 1–80, `target_cents > 0`, `monthly_contribution_cents > 0` quando não nulo.
- `goal_allocations` com FKs compostas para `goals` e `accounts`, check de sinal por tipo (`aporte` > 0; `resgate`, `liberacao` < 0).
- Gatilho `before insert` em `goal_allocations`: `select ... for update` na conta; recusa aporte em meta com `completed_at`/`archived_at` ou conta arquivada; recusa se reserva da meta naquela conta ficaria negativa; recusa aporte acima de `saldo_atual(conta) − reservas ativas da conta`. Saldo atual: usar a mesma expressão/função que `listarContasComSaldo` usa (ler `migrations/003*`–`005*` e `src/data/accounts.ts`; se não houver função SQL de saldo, criar `saldo_atual_conta(uuid)` aqui, com teste). "Reservas ativas" = soma dos movimentos de metas não concluídas e não arquivadas. Errcode `check_violation` com mensagens em português.
- RLS forçada nas duas; `grant select, insert, update on goals`; `grant select, insert on goal_allocations` (sem UPDATE/DELETE).
- Down migration.

**Testes:** meta/movimento com conta de outro usuário recusado; RLS cruzada; UPDATE e DELETE em `goal_allocations` recusados; sinal incoerente recusado; alvo ≤ 0 recusado; aporte acima do não reservado recusado; resgate maior que a reserva naquela conta recusado; aporte em meta concluída/arquivada recusado; dois aportes concorrentes (duas conexões, `Promise.all`) que juntos passam do saldo: um falha.

**Commit:** `feat(db): metas e reservas só-inserção`

---

### Task 4: Dados

**Files:** create `src/data/goals.ts`; test `tests/integration/repo-goals.test.ts`.

**Interfaces (Consumes):** Task 1–2 (`avaliarMeta`, `reservaParaDesconto`, tipos), Task 3 (tabelas).
**Interfaces (Produces):**

```ts
export interface DadosMeta { name: string; kind: GoalKind; targetCents: Cents; targetDate: IsoDate | null; priority: GoalPriority; accountId: string | null; monthlyContributionCents: Cents | null }
export interface Meta extends DadosMeta { id: string; completedAt: string | null; archivedAt: string | null }
export interface MetaAvaliada extends Meta { reservado: Cents; reservasPorConta: { accountId: string; accountName: string; reservado: Cents; acimaDoSaldo: Cents }[]; avaliacao: AvaliacaoMeta }
export interface MovimentoMeta extends Movimento { id: string; accountName: string }

export async function criarMeta(userId: string, dados: DadosMeta): Promise<Meta>
export async function alterarMeta(userId: string, metaId: string, dados: DadosMeta): Promise<void>
export async function aportar(userId: string, metaId: string, m: { accountId: string; amountCents: Cents; occurredOn: IsoDate }): Promise<void>
export async function resgatar(userId: string, metaId: string, m: { accountId: string; amountCents: Cents; occurredOn: IsoDate }): Promise<void>  // amountCents positivo; grava negativo
export async function concluirMeta(userId: string, metaId: string, hoje: IsoDate): Promise<void>
export async function arquivarMeta(userId: string, metaId: string, hoje: IsoDate): Promise<void>
export async function listarMetas(userId: string, hoje: IsoDate, diaInicio: number): Promise<{ ativas: MetaAvaliada[]; encerradas: Meta[] }>
export async function buscarMeta(userId: string, metaId: string, hoje: IsoDate, diaInicio: number): Promise<{ meta: MetaAvaliada; movimentos: MovimentoMeta[] } | null>
export async function reservasPorConta(userId: string): Promise<Map<string, Cents>>
export async function naoReservado(userId: string, accountId: string): Promise<Cents>
export class ReservaRecusadaError extends Error { constructor(public motivo: 'saldo' | 'reserva' | 'encerrada', public disponivel: Cents | null) }
```

`concluirMeta`/`arquivarMeta` numa transação: grava a data e insere uma `liberacao` por conta com reserva > 0. `aportar`/`resgatar` traduzem o `check_violation` do gatilho em `ReservaRecusadaError` com o valor disponível. Ordenação: prioridade (alta, média, baixa), depois data-alvo (nulas por último).

**Testes:** concluir e arquivar zeram a reserva e preservam o histórico; reserva em conta excluída não entra em `reservaParaDesconto(await reservasPorConta(...), contas)`; despesa paga depois do aporte gera `acimaDoSaldo > 0` sem apagar reserva; ritmo pela média usa movimentos do banco; erros viram `ReservaRecusadaError` com `disponivel` correto; ordenação.

**Commit:** `feat(data): metas, reservas e avaliação`

---

### Task 5: Interface — páginas de metas

**Files:** create `src/app/(app)/metas/*` (lista, nova, detalhe, editar, `acoes.ts`, `formulario.tsx`); link "Metas" em `src/app/(app)/navegacao.tsx`; reservado por conta em `src/app/(app)/contas/page.tsx`.

Conforme spec seção 8: lista com barra `role="meter"` e situação; detalhe com progresso, necessária, ritmo e origem ("No ritmo planejado de R$ X/mês" / "Na média dos últimos 3 meses, R$ X/mês"), explicação e três opções como links para `/metas/[id]/editar?alvo=…|contribuicao=…|data=…`, simulação por formulário GET (`?simular=`), reservar/resgatar com não reservado da conta e texto fixo "Reservar não move dinheiro entre contas. Se quiser o dinheiro numa conta separada, registre também a transferência.", movimentos, concluir quando atingida, arquivar com diálogo (`src/components/dialog.tsx`) dizendo quanto será liberado por conta. Ações com zod, `audit_events` `meta.criada|alterada|aporte|resgate|concluida|arquivada` **sem valor nem nome**, log de erro só com código (como `orcamentos/acoes.ts`). Mensagens de `ReservaRecusadaError` no formulário.

**Verificação:** `npm run lint`, `npm run typecheck`, `npm run build`.

**Commit:** `feat(ui): páginas de metas`

---

### Task 6: Interface — cartão na tela inicial

**Files:** create `src/components/metas-resumo.tsx`; modify `src/app/(app)/page.tsx`.

Até três metas ativas (ordem de `listarMetas`), barra e situação; sem metas: "Nenhuma meta ainda" com link para `/metas/nova`.

**Commit:** `feat(ui): metas na tela inicial`

---

### Task 7: Verificação e segurança

- `tests/integration/log-sem-valores.test.ts`: fluxo de metas (criar, aportar, resgatar, concluir, arquivar) sem valor nem nome em log e `audit_events`.
- Teste de XSS de renderização (procurar o existente com `grep -rn "XSS\|<script" tests`) cobre nome de meta.
- `docs/seguranca/modelo-de-ameacas.md`: T3, T20 e a ameaça de imutabilidade apontam os testes novos.
- No navegador, se possível: criar meta, reservar, ver aviso de saldo, opção de prazo pré-preenchendo, simular, concluir.
- Verificação completa: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run build`, `npm run seguranca:segredos`, `npm run seguranca:auditoria`.

**Commit:** `docs(seguranca): metas no modelo de ameaças e verificação final`
