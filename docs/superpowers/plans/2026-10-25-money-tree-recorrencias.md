# Money Tree — Fatia 2 (Recorrências): Plano de Implementação

**Goal:** regras de repetição que geram ocorrências previstas, vencimentos e próximas contas, sem job e sem tocar no que foi pago.

**Spec:** `docs/superpowers/specs/2026-10-25-money-tree-recorrencias-design.md` (aprovada com as cinco recomendações da seção 12).

**Architecture:** a mesma da fatia 1. Datas e regras de série em `src/domain/recurrence.ts`, puro. SQL só em `src/data/`. O banco carrega as invariantes que não podem depender do código: chave única de ocorrência, gatilho de imutabilidade, RLS.

## Global Constraints

Valem todas as da fatia 1 (centavos inteiros, `date` para data financeira, RLS forçada, nada sensível em log, teste antes do código, commit por tarefa). Mais estas:

- **Data de ocorrência sempre calculada a partir da âncora** (`start_date + k × interval`), nunca da ocorrência anterior.
- **Ocorrência nunca é apagada enquanto a regra existe**, exceto as não tocadas que uma edição de série, pausa ou encerramento substitui. Pular é cancelar.
- **Nenhuma operação de série altera linha liquidada, conciliada, estornada, cancelada ou de exceção.**
- **Gerar ocorrências nunca altera saldo.**
- Decisões confirmadas: horizonte de 90 dias; fim de semana `proximo_dia_util` para despesa e `manter` para receita e transferência; sem feriados; primeira ocorrência até 60 dias no passado; valor incomum acima de 25% da mediana dos últimos 3 pagamentos.

## Estrutura de arquivos

```
migrations/
  007_imutabilidade.sql          gatilho que protege lançamento liquidado
  008_recorrencias.sql           recurrence_rules, colunas novas, create_transfer
src/domain/
  recurrence.ts                  datas, texto da regra, edição de série, avisos
src/data/
  transactions.ts                liquidar/cancelar transferência pelo grupo
  recurrences.ts                 regras, geração, série, próximas contas
src/app/(app)/
  recorrencias/                  lista, nova, [id]
  page.tsx                       ganha "Próximas contas"
  lancamentos/                   "Repetir", ações de ocorrência, ícone e filtro
tests/unit/recurrence*.test.ts
tests/integration/007-*.test.ts, 008-*.test.ts, repo-recurrences*.test.ts
```

Diferença em relação à spec: a spec fala numa migração 007 única. O gatilho de imutabilidade é correção da fatia 1 e vale sozinho, então vai na 007, e as recorrências na 008.

## Ordem das tarefas

Correções herdadas primeiro (tarefas 1–2), porque a edição de ocorrências depende delas. Depois domínio (3–4), banco (5), dados (6–7) e interface (8–11). A 12 fecha segurança e verificação.

---

### Task 1: Transferência muda de estado inteira

**Files:** `src/data/transactions.ts`; teste em `tests/integration/repo-transactions.test.ts`.

**Teste que falha primeiro:**
- criar transferência `previsto`, chamar `atualizarStatus` num lado para `liquidado`: os dois lados ficam liquidados, com a mesma data, e o total das contas não muda;
- o mesmo partindo do outro lado;
- `cancelado` também vale para o grupo.

**Implementação:** `atualizarStatus` lê o grupo com `FOR UPDATE` (como `estornarLancamento`), valida a transição em cada lado e atualiza todos na mesma transação.

**Commit:** `fix(data): mudança de estado de transferência vale para os dois lados`

---

### Task 2: Gatilho de imutabilidade do lançamento liquidado

**Files:** `migrations/007_imutabilidade.sql`; `tests/integration/007-imutabilidade.test.ts`.

**Teste que falha primeiro**, como `money_tree_app`, numa linha liquidada: mudar `amount_cents`, `direction`, `account_id`, `category_id`, `description`, `competence_date` ou `kind` é recusado com mensagem que manda estornar. Continuam permitidos: liquidado → conciliado, liquidado → estornado (com `settled_date` preservada) e qualquer edição em linha prevista.

**Implementação:** gatilho `BEFORE UPDATE` que, quando `old.status` está em (`liquidado`, `conciliado`, `estornado`), compara `to_jsonb(new)` e `to_jsonb(old)` sem `status`, `settled_date` e `updated_at`. Comparar o JSON inteiro protege também as colunas que vierem depois. `settled_date` só pode mudar junto com uma mudança de `status`.

**Commit:** `fix(db): lançamento liquidado só muda de estado; o resto exige estorno`

---

### Task 3: Domínio — datas da recorrência e texto da regra

**Files:** `src/domain/recurrence.ts`; `tests/unit/recurrence.test.ts`.

**Interfaces:**
- `type UnidadeRecorrencia = 'dia' | 'semana' | 'mes' | 'ano'`
- `type PoliticaFimDeSemana = 'manter' | 'proximo_dia_util'`
- `interface RegraDatas { startDate; unit; interval; dayOfMonth: number | null; endDate: IsoDate | null; maxOccurrences: number | null; weekendPolicy }`
- `ocorrencias(regra, de, ate): { nominal: IsoDate; vencimento: IsoDate; indice: number }[]`
- `descreverRegra(regra): string`
- `validarRegra(regra): void` (intervalo 1–366, dia do mês 1–31, fins exclusivos, fim ≥ início)

**Testes:** casos fixos (31/jan → 28/fev → 31/mar; 29/fev anual; sábado → segunda; "a cada 2 semanas") e as cinco propriedades da spec, 6.2: limites e ordem, partição, sem deriva, fim de semana e `max_occurrences`. `descreverRegra` caso a caso.

**Cuidado:** a partição precisa de `de` exclusivo na segunda metade; a assinatura usa intervalo fechado `[de, ate]` e o teste compõe `[a, b]` com `[b+1, c]`.

**Commit:** `feat(domain): datas de recorrência ancoradas, sem deriva`

---

### Task 4: Domínio — edição de série, valor incomum e reserva sugerida

**Files:** `src/domain/recurrence.ts`; `tests/unit/recurrence-serie.test.ts`.

**Interfaces:**
- `interface OcorrenciaExistente { id; nominal: IsoDate; status; isException: boolean }`
- `tocada(ocorrencia): boolean`: verdadeiro se não está prevista ou se é exceção.
- `planejarEdicaoSerie({ regra, aPartirDe, ocorrencias }): { fimDaAntiga: IsoDate; apagar: string[]; restantes: number | null }`
- `valorIncomum(pago, ultimosPagos): { percentual; mediana } | null`
- `reservaMensal(valor, hoje, proximoVencimento): { meses; porMes: Cents } | null`

**Testes:** propriedade "nenhuma tocada entra em `apagar`"; `restantes` herda `max_occurrences` menos as ocorrências anteriores à data de corte; `valorIncomum` sem histórico, com menos de 3, com mediana zero e na fronteira de 25%; `reservaMensal` sempre cobre o valor (`porMes × meses ≥ valor`) e é inteira em centavos.

**Commit:** `feat(domain): edição de série que não toca no pago, valor incomum e reserva`

---

### Task 5: Migração 008 — regras e colunas novas

**Files:** `migrations/008_recorrencias.sql`; `tests/integration/008-recorrencias.test.ts`.

**Schema:** como na spec, 5.1 e 5.2. Mais:
- `UNIQUE (recurrence_rule_id, occurrence_date, direction) WHERE recurrence_rule_id IS NOT NULL`;
- `occurrence_date` não nulo exatamente quando há regra;
- `create_transfer` recriada com `p_rule_id uuid default null`, `p_occurrence_date date default null` e `p_due_date date default null` (`DROP` + `CREATE`, porque o Postgres não altera a lista de parâmetros);
- RLS e `GRANT` em `recurrence_rules` (sem `DELETE`: regra não se apaga).

**Testes:** constraints da spec (transferência sem destino, destino igual à origem, categoria em transferência, `day_of_month` fora de 1–31 ou na unidade errada, fim duplo); chave única recusando ocorrência repetida e aceitando os dois lados de uma transferência; RLS cruzada em `recurrence_rules`.

**Commit:** `feat(db): regras de recorrência e vínculo das ocorrências`

---

### Task 6: Dados — regras e geração de ocorrências

**Files:** `src/data/recurrences.ts`; `src/data/transactions.ts` (mapeia as colunas novas); `src/domain/transaction.ts` (`estaAtrasado` usa `dueDate ?? competenceDate`); `tests/integration/repo-recurrences.test.ts`.

**Interfaces:** `interface Regra`, `criarRegra(userId, dados, { primeiraOcorrencia? })`, `listarRegras`, `buscarRegra`, `garantirOcorrencias(userId, hoje)`, `ocorrenciasDaRegra(userId, regraId)`.

**Testes:**
- gera até `hoje + 90` e não mais;
- duas chamadas seguidas, e duas em paralelo, geram cada ocorrência uma vez (T17);
- regra com `generated_until` em dia não faz `INSERT`;
- transferência recorrente gera os dois lados com `transfer_group_id`;
- gerar não muda o saldo;
- limites: 201ª regra ativa recusada; uma chamada não passa de 1.000 ocorrências (T18);
- primeira ocorrência mais de 60 dias no passado é recusada;
- "o lançamento vira a primeira ocorrência": `criarRegra` com `primeiraOcorrencia` vincula o lançamento existente em vez de gerar outro.

**Commit:** `feat(data): regras de recorrência e geração idempotente de ocorrências`

---

### Task 7: Dados — série, pular, pausar, pagar e próximas contas

**Files:** `src/data/recurrences.ts`; `tests/integration/repo-recurrences-serie.test.ts`.

**Interfaces:** `editarOcorrencia(userId, id, dados)` (marca exceção), `editarDestaEmDiante(userId, ocorrenciaId, mudancas)`, `pularOcorrencia`, `pausarRegra`, `retomarRegra`, `encerrarRegra`, `pagarOcorrencia(userId, id, { valor, quando })` (devolve o aviso de valor incomum), `proximasContas(userId, hoje, dias)`.

**Testes:**
- desta em diante: a regra antiga termina na véspera, a nova gera dali, e pago, cancelado e exceção ficam intactos (T19);
- pular e gerar de novo não recria;
- pausar apaga as futuras não tocadas; retomar gera de hoje e não preenche a pausa;
- encerrar não apaga a regra;
- pagar valor estimado grava o valor real; o quarto pagamento 30% acima da mediana devolve aviso;
- editar ocorrência liquidada é recusado pelo gatilho da Task 2;
- `proximasContas` traz as atrasadas primeiro e separa somas de pagar e receber, sem transferências.

**Commit:** `feat(data): edição de série, pular, pausar, pagar ocorrência e próximas contas`

---

### Task 8: Interface — geração no layout e próximas contas

**Files:** `src/app/(app)/layout.tsx`; `src/app/(app)/page.tsx`; componente `src/components/proximas-contas.tsx`.

`garantirOcorrencias` roda no layout, depois de `exigirUsuario`. Falha na geração é registrada em log (sem dado) e não derruba a página: a próxima requisição tenta de novo.

"Próximas contas" na inicial, depois do saldo: atrasadas e próximos 30 dias agrupados por data, selo de estado, "≈ estimado" quando couber, "a pagar" e "a receber" separados e rotulados. Uma nota diz que vencimentos não consideram feriados.

**Commit:** `feat(ui): próximas contas na tela inicial`

---

### Task 9: Interface — telas de recorrência

**Files:** `src/app/(app)/recorrencias/{page,acoes,formulario}.tsx`, `nova/page.tsx`, `[id]/page.tsx`; link "Recorrências" na navegação.

A lista agrupa ativas, pausadas e encerradas, com texto da regra, valor e próxima ocorrência. O formulário mostra o texto da regra e as próximas três datas enquanto a pessoa preenche (domínio puro, roda no cliente). A página da regra traz pausar, retomar e encerrar (encerrar com diálogo), as ocorrências passadas e futuras e a reserva sugerida quando couber.

**Commit:** `feat(ui): telas de recorrência`

---

### Task 10: Interface — "Repetir" no lançamento e ações de ocorrência

**Files:** `src/app/(app)/lancamentos/{formulario,acoes}.tsx`, `[id]/page.tsx`, `page.tsx`, `filtros.tsx`; `src/components/item-lancamento.tsx`.

- "Repetir" no formulário de lançamento, com prévia das datas.
- Detalhe de ocorrência: "Parte de: Aluguel, todo dia 5"; pagar com valor real (e aviso de valor incomum); pular (diálogo); editar com a pergunta "Só esta" ou "Desta em diante" (diálogo); link para a regra.
- Lista: ícone ↻ com texto acessível e filtro "Recorrentes".
- Desfazer de ocorrência cancela em vez de apagar.

**Commit:** `feat(ui): repetir lançamento e ações de ocorrência`

---

### Task 11: Verificação no navegador

Fluxo completo com o servidor rodando: criar aluguel mensal no dia 31, conferir fevereiro; conta de luz estimada; transferência mensal para a poupança, liquidada pelos dois lados; pular, editar só uma, desta em diante, pausar, retomar e encerrar; próximas contas na inicial; teclado e foco nos diálogos.

---

### Task 12: Segurança e fechamento

**Files:** `docs/seguranca/modelo-de-ameacas.md`; eventos de auditoria nas ações.

- T17–T20 entram no modelo, cada uma apontando seu teste.
- Eventos `regra.criada`, `regra.editada`, `regra.pausada`, `regra.retomada`, `regra.encerrada` e `ocorrencia.pulada`, sem valor nem frequência.
- `tests/integration/log-sem-valores.test.ts` ganha o fluxo de recorrência.
- Suíte completa, lint, tipos, build, verificador de segredos e auditoria.

**Commit:** `docs(seguranca): ameaças T17 a T20 e auditoria das recorrências`
