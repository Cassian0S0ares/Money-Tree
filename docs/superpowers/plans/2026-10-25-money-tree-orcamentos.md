# Money Tree — Fatia 3 (Orçamentos): Plano de Implementação

**Goal:** limite de gasto por categoria e mês financeiro, com acumulação de sobra, ritmo e previsão de estouro.

**Spec:** `docs/superpowers/specs/2026-10-25-money-tree-orcamentos-design.md` (aprovada com as seis recomendações da seção 11).

**Architecture:** igual às fatias anteriores. Cálculo em `src/domain/budget.ts`, puro; SQL em `src/data/budgets.ts`; o banco garante categoria-raiz de despesa, dono e limite não negativo.

## Global Constraints

Valem as das fatias 1 e 2. Mais estas:

- **Competência** é a base de todo gasto de orçamento.
- **Só despesa** conta. Realizado é `liquidado` ou `conciliado`; comprometido é `previsto` ou `pendente`; `estornado` e `cancelado` não contam.
- **Subcategoria soma na raiz**, e orçamento só existe na raiz.
- **Limite é datado:** mudar vale daqui em diante; período anterior nunca muda.
- **Acumula só a sobra.**
- **Previsão** só depois do 7º dia, projetando só o gasto variável.

## Estrutura de arquivos

```
migrations/010_orcamentos.sql
src/domain/budget.ts
src/data/budgets.ts
src/app/(app)/orcamentos/{page,acoes,formulario}.tsx
src/components/orcamento-resumo.tsx      cartão da tela inicial
tests/unit/budget.test.ts
tests/integration/010-orcamentos.test.ts, repo-budgets.test.ts
```

## Ordem das tarefas

Domínio (1–2), banco (3), dados (4), interface (5–6), verificação e segurança (7).

---

### Task 1: Domínio — período, limite vigente e acumulação

**Files:** `src/domain/budget.ts`; `tests/unit/budget.test.ts`.

**Interfaces:**
- `interface Periodo { inicio: IsoDate; fim: IsoDate }`
- `periodoAnterior(periodo, diaInicio)`, `proximoPeriodo(periodo, diaInicio)`, `diasDoPeriodo(periodo)`
- `limiteVigente(limites: { startsOn; amountCents }[], inicio): Cents | null`
- `disponiveis({ periodos, limites, rolloverSince, realizadoPorPeriodo }): Map<inicio, Cents>`

**Testes:** limite vigente com histórico, antes de existir e com `starts_on` fora do início de período (mudança de `month_start_day`); acumulação de três meses com sobra, estouro e limite alterado no meio; propriedades 2 (disponível ≥ limite, nunca carrega estouro) e 4 (mudar limite a partir de P não altera nada antes de P).

**Commit:** `feat(domain): limite datado e acumulação de sobra do orçamento`

---

### Task 2: Domínio — ritmo, previsão e situação

**Files:** `src/domain/budget.ts`; `tests/unit/budget-avaliacao.test.ts`.

**Interface:** `avaliar({ disponivel, realizado, realizadoVariavel, comprometido, periodo, hoje }): Avaliacao`, com `restante`, `percentual`, `esperadoHoje`, `ritmo`, `previsto`, `estouroPrevisto` e `situacao`.

**Testes:** ritmo nas duas bordas da tolerância; previsão ausente antes do 7º dia e presente no 7º; gasto fixo não é extrapolado; limite zero; período passado (sem ritmo, sem previsão); período futuro; propriedade 3 (previsto ≥ realizado + comprometido; taxa zero ⇒ igual). Tudo em centavos inteiros.

**Commit:** `feat(domain): ritmo, previsão de estouro e situação do orçamento`

---

### Task 3: Migração 010

**Files:** `migrations/010_orcamentos.sql`; `tests/integration/010-orcamentos.test.ts`.

`budgets` e `budget_limits` como na spec (4.1, 4.2), com chaves compostas por usuário, RLS forçada, `GRANT` sem `DELETE` em `budget_limits` (histórico) e gatilho que recusa categoria com pai ou de receita.

**Testes:** orçamento em subcategoria e em receita recusado; categoria de outro usuário recusada; segundo orçamento ativo da mesma categoria recusado, mas permitido depois de arquivar o primeiro; limite negativo recusado; `starts_on` repetido recusado; RLS cruzada.

**Commit:** `feat(db): orçamentos com limite datado`

---

### Task 4: Dados

**Files:** `src/data/budgets.ts`; `tests/integration/repo-budgets.test.ts`.

**Interfaces:** `criarOrcamento`, `alterarLimite`, `definirAcumulacao`, `removerOrcamento`, `resumoOrcamento(userId, periodo, hoje, diaInicio)`.

**Testes:** subcategoria soma na raiz; estornado e cancelado fora; ocorrência prevista vira comprometido; receita, transferência e ajuste fora; mudar o limite daqui em diante preserva o passado; acumulação ao longo de três meses; propriedade 1 (soma por raiz = total categorizado) contra o banco, com lançamentos gerados; categoria sem orçamento aparece com o gasto.

**Commit:** `feat(data): orçamentos e resumo por mês financeiro`

---

### Task 5: Interface — página de orçamentos

**Files:** `src/app/(app)/orcamentos/*`; link na navegação.

Resumo do período, uma linha por categoria com barra `role="meter"`, marca de ritmo, comprometido, situação com ícone e texto, previsão; categorias sem orçamento com "Definir limite"; formulário curto com "a partir de qual mês" e acumulação; remover com diálogo; navegação entre períodos; aviso de que orçamento não separa dinheiro.

**Commit:** `feat(ui): página de orçamentos`

---

### Task 6: Interface — cartão na tela inicial

**Files:** `src/components/orcamento-resumo.tsx`; `src/app/(app)/page.tsx`.

Até três categorias em pior situação, ou uma linha dizendo que está tudo dentro.

**Commit:** `feat(ui): orçamento do mês na tela inicial`

---

### Task 7: Verificação e segurança

No navegador: definir limite, gastar, ver ritmo e previsão, mudar daqui em diante e conferir o mês anterior, acumulação, remover. Depois: eventos de auditoria sem valor, teste de log com o fluxo de orçamento, T3 e T20 no modelo de ameaças apontando os testes novos, e a verificação completa (lint, tipos, testes, build, segredos, auditoria).

**Commit:** `docs(seguranca): orçamentos no modelo de ameaças e verificação final`
