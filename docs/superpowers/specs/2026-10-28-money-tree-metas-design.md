# Money Tree — Design da Fatia 4: Metas

**Data:** 2026-10-28
**Contrato de produto:** `PRODUCT.md` v0.2
**Depende de:** Fatias 1 (núcleo), 2 (recorrências) e 3 (orçamentos), concluídas
**Escopo:** metas com valor-alvo e prazo opcional, reservas (alocações) sem dupla contagem, contribuição necessária, data provável e opções quando o prazo é inviável
**Estado:** aprovado em 2026-10-28 com as recomendações da seção 11 (mesmo critério das fatias 2 e 3)

---

## 1. Contexto

Com as fatias 1 a 3, o Money Tree sabe quanto existe em cada conta, o que vence e quanto a pessoa pretende gastar. Ainda não sabe **para que** ela está guardando dinheiro, nem separa parte do saldo para isso.

Ao fim desta fatia, o usuário consegue:

- criar uma meta com nome, tipo, valor-alvo, data-alvo opcional, prioridade e contribuição mensal planejada opcional;
- reservar dinheiro de uma conta para a meta, e resgatar;
- ver quanto falta, o percentual, a contribuição mensal necessária e o mês provável de conclusão;
- ver, quando o prazo não fecha, a diferença e três opções (aumentar contribuição, reduzir alvo, mudar data), sem nada aplicado sozinho;
- simular "e se eu contribuir R$ X por mês" sem gravar nada;
- concluir ou arquivar a meta, liberando a reserva.

E o sistema passa a ter **alocações**, que a fatia de dinheiro livre vai descontar exatamente uma vez.

Ordem das fatias, mantida: recorrências → orçamentos → **metas** → dinheiro livre e dashboard → gráficos.

---

## 2. O que o PRODUCT.md pede, e o que esta fatia entrega

| §5.8 | Nesta fatia | Por quê |
|---|---|---|
| Tipos de meta | **Sim** | Enum; só rótulo e ícone, mesmas regras para todos |
| Nome, valor-alvo, data-alvo opcional, prioridade | **Sim** | — |
| Valor já reservado | **Sim**, derivado das alocações | Seção 4.2; nunca um campo editável solto |
| Conta associada opcional | **Sim** | Conta padrão dos aportes |
| Contribuição recorrente opcional | **Sim**, como **plano** (decisão 3) | Não gera lançamento nem reserva sozinha |
| Forma da reserva: virtual, segregada, futura | **Sim**, derivada da conta (decisão 1) | Seção 3.1 |
| Quanto falta, percentual | **Sim** | — |
| Contribuição mensal necessária | **Sim** | Seção 6.2 |
| Data provável no ritmo atual | **Sim**, em mês financeiro | Seção 6.3 |
| Impacto de alterar a contribuição | **Sim**, simulação sem gravar | Seção 6.5 |
| Prazo inviável: explicar e oferecer opções | **Sim** | Seção 6.4; nada é aplicado automaticamente |
| Quitação de dívida ligada à dívida | **Adiado** | Dívidas são da Fase 2; o tipo existe, sem vínculo |
| Dinheiro livre descontando a reserva | **Adiado** para a próxima fatia | Esta fatia entrega a função que diz o que descontar |

---

## 3. Decisões de cálculo

### 3.1 Forma da reserva vem da conta

Cada movimento de reserva aponta para uma **conta**. A forma não é escolhida à parte; ela decorre de `include_in_available` da conta:

| Conta do movimento | Forma | No dinheiro livre (fatia 5) |
|---|---|---|
| `include_in_available = true` | **Virtual**: envelope dentro de dinheiro disponível | Desconta **uma vez** |
| `include_in_available = false` | **Segregada**: o dinheiro já está fora do disponível | **Não** desconta de novo |
| (sem movimento; só contribuição planejada) | **Futura** | Só na projeção |

Assim a regra do §5.8 ("não pode ser descontado duas vezes") é estrutural: não existe forma de marcar uma reserva como virtual numa conta já excluída. Se a pessoa muda `include_in_available` de uma conta, as reservas nela mudam de forma junto, e o desconto continua acontecendo uma vez só.

### 3.2 Reservado é soma de movimentos

O valor reservado de uma meta é a soma dos seus movimentos de alocação (aporte positivo, resgate negativo). Não há campo "valor reservado" editável: corrigir é registrar um movimento oposto, como no razão.

### 3.3 Reserva não passa do saldo

Na hora do aporte, o valor não pode passar do **saldo não reservado** da conta:

```text
nao_reservado(conta) = saldo_atual(conta) − soma_das_reservas_ativas(conta)
```

O saldo pode cair depois (uma despesa paga daquela conta). O sistema não apaga reserva por isso: mostra o aviso "Reservado maior que o saldo da conta em R$ X" na meta e na conta. Resgatar é escolha da pessoa.

Resgate não passa do que a meta tem reservado **naquela conta**.

### 3.4 Contribuição e meses

A unidade de contribuição é o **mês financeiro** (`month_start_day`), como no orçamento. "Meses restantes" conta o período atual e todos os que começam até a data-alvo:

```text
meses_restantes = quantidade de períodos p com p.inicio <= data_alvo, a partir do período atual
```

Com data-alvo no próprio período atual, `meses_restantes = 1`. Com data-alvo passada, a meta está **com prazo vencido** (seção 6.4).

---

## 4. Schema — migração 011

### 4.1 `goals`

| Campo | Regra |
|---|---|
| `user_id` | RLS forçada |
| `name` | texto, 1 a 80 caracteres |
| `kind` | enum `goal_kind`: `reserva_emergencia`, `viagem`, `compra`, `quitacao_divida`, `educacao`, `longo_prazo`, `livre` |
| `target_cents` | `bigint > 0` |
| `target_date` | `date`, opcional |
| `priority` | enum `goal_priority`: `alta`, `media`, `baixa` |
| `account_id` | opcional; conta padrão dos aportes, do mesmo usuário (FK composta) |
| `monthly_contribution_cents` | opcional, `bigint > 0`; contribuição planejada |
| `completed_at` | meta concluída |
| `archived_at` | meta arquivada |

`UNIQUE (id, user_id)` para as FKs compostas. Concluída e arquivada não recebem aporte (gatilho em `goal_allocations`).

### 4.2 `goal_allocations`

Movimentos de reserva. **Só inserção**: `GRANT` sem `UPDATE` nem `DELETE`, como o histórico de limites.

| Campo | Regra |
|---|---|
| `user_id` | RLS forçada |
| `goal_id` | FK composta |
| `account_id` | FK composta; conta do mesmo usuário |
| `amount_cents` | `bigint <> 0`; positivo é aporte, negativo é resgate |
| `kind` | enum `allocation_kind`: `aporte`, `resgate`, `liberacao` |
| `occurred_on` | `date` |

Checks: `aporte` positivo; `resgate` e `liberacao` negativos. Um gatilho recusa:

- aporte em meta concluída ou arquivada;
- aporte em conta arquivada;
- movimento que deixaria negativa a reserva da meta naquela conta;
- aporte acima do não reservado da conta (seção 3.3).

O limite de saldo fica no banco porque depende de outras linhas e precisa valer mesmo com duas abas abertas. O gatilho trava a conta (`SELECT ... FOR UPDATE` em `accounts`) para serializar aportes concorrentes.

`liberacao` é o movimento que zera a reserva ao concluir ou arquivar.

---

## 5. Arquitetura

Como nas fatias anteriores: `src/domain/goal.ts` puro, `src/data/goals.ts` com o SQL, telas em `src/app/(app)/metas/`, cartão em `src/components/metas-resumo.tsx`.

---

## 6. Domínio — `src/domain/goal.ts`

### 6.1 Progresso

```text
falta      = max(0, alvo − reservado)
percentual = min(100, floor(reservado × 100 / alvo))
```

Reservado ≥ alvo: a meta está **atingida** e a tela oferece "Concluir". Não conclui sozinha.

### 6.2 Contribuição necessária

```text
necessaria = ceil(falta / meses_restantes)      (centavos inteiros)
```

Arredonda para cima: com o valor sugerido, a meta fecha. Sem data-alvo, não há contribuição necessária.

### 6.3 Ritmo e mês provável

O **ritmo** é, nesta ordem:

1. a contribuição planejada, quando definida;
2. senão, a média líquida mensal dos movimentos (aportes − resgates, sem `liberacao`) dos **três últimos meses financeiros completos**;
3. senão, nenhum: "Sem ritmo para estimar a data".

Ritmo ≤ 0 também é "sem ritmo".

```text
meses_para_concluir = ceil(falta / ritmo)
mes_provavel        = período atual + (meses_para_concluir − 1)
```

A tela diz qual ritmo usou: "No ritmo planejado de R$ 500/mês" ou "Na média dos últimos 3 meses, R$ 320/mês". Sempre como estimativa (§3, princípio 6).

### 6.4 Prazo inviável

Uma meta com data-alvo está **fora do prazo** quando:

- o mês provável começa depois da data-alvo (o período que contém a data-alvo conta como mês de contribuição, como em 3.4); ou
- não há ritmo e falta > 0; ou
- a data-alvo já passou e falta > 0 (**prazo vencido**).

A tela explica a diferença ("No ritmo atual, faltariam R$ X na data-alvo" ou "No ritmo atual, conclui em março de 2028, 5 meses depois da data-alvo") e oferece três opções, cada uma com o valor calculado:

| Opção | Cálculo |
|---|---|
| Aumentar a contribuição | para `necessaria` |
| Reduzir o alvo | para `reservado + ritmo × meses_restantes` (sem ritmo, para `reservado`) |
| Mudar a data | para o fim do `mes_provavel` (sem ritmo, opção ausente) |

Cada opção abre o formulário da meta **preenchido** com o novo valor. Nada muda até a pessoa salvar (§5.8: "nenhuma opção deve ser aplicada automaticamente"). Com prazo vencido, "reduzir o alvo" não aparece (não restam meses).

### 6.5 Simulação

`simular(meta, contribuicao)` devolve o mês provável e, havendo data-alvo, a diferença em meses e o valor que faltaria na data. Não grava nada. A tela mostra: "Com R$ X por mês, conclui em <mês>, <n> meses antes/depois da data-alvo."

### 6.6 Desconto no dinheiro livre

`reservaParaDesconto(reservasPorConta, contas): Cents` soma só as reservas ativas em contas com `include_in_available`. A fatia 5 usa esta função; aqui ela existe e é testada.

### 6.7 Situação

Sempre com ícone e texto, nunca só cor:

| Situação | Quando | Texto |
|---|---|---|
| **Atingida** | reservado ≥ alvo | "Meta atingida" |
| **Prazo vencido** | data passou e falta > 0 | "O prazo passou; faltam R$ X" |
| **Fora do prazo** | seção 6.4 | "No ritmo atual, não fecha até <data>" |
| **No prazo** | com data, o resto | "No ritmo atual, conclui em <mês>" |
| **Sem prazo** | sem data | "Sem data-alvo" (+ mês provável se houver ritmo) |
| **Reserva acima do saldo** | aviso extra, combina com qualquer uma | "Reservado maior que o saldo da conta em R$ X" |

### 6.8 Invariantes, como teste de propriedade

1. **Uma vez só:** `reservaParaDesconto` é igual à soma das reservas em contas incluídas; mudar uma reserva de conta excluída não altera o resultado.
2. **Necessária fecha:** `necessaria × meses_restantes ≥ falta` e `(necessaria − 1) × meses_restantes < falta`.
3. **Monotonia:** contribuição maior nunca dá mês provável posterior.
4. **Reservado nunca negativo** por meta e conta, para qualquer sequência de movimentos aceita.
5. **Opções coerentes:** aplicar qualquer opção de 6.4 à meta faz ela deixar de estar fora do prazo (exceto com prazo vencido, onde só a mudança de data resolve).
6. **Percentual** entre 0 e 100 e falta ≥ 0.

---

## 7. Dados — `src/data/goals.ts`

- `criarMeta(userId, dados)`, `alterarMeta(userId, metaId, dados)`
- `aportar(userId, metaId, { accountId, amountCents, occurredOn })`
- `resgatar(userId, metaId, { accountId, amountCents, occurredOn })`
- `concluirMeta(userId, metaId, hoje)` e `arquivarMeta(userId, metaId, hoje)`: na mesma transação, gravam a data e inserem uma `liberacao` por conta com reserva.
- `listarMetas(userId, hoje, diaInicio)`: metas ativas com reservado por conta, movimentos dos três últimos meses financeiros completos e avaliação do domínio, ordenadas por prioridade e data-alvo.
- `buscarMeta(userId, metaId, hoje, diaInicio)`: a meta com o histórico de movimentos.
- `reservasPorConta(userId)`: total reservado ativo por conta, para a tela de contas e a fatia 5.

Erros do gatilho viram mensagem de formulário: "Essa conta tem só R$ X sem reserva" e "Essa meta tem só R$ X reservado nesta conta".

---

## 8. Telas

```
/metas                 metas ativas; concluídas e arquivadas num bloco recolhido
/metas/nova            formulário
/metas/[id]            detalhe: progresso, situação, opções, simulação, movimentos
/metas/[id]/editar     formulário (aceita valores pré-preenchidos das opções por query)
/                      ganha "Metas": até três, por prioridade
/contas                cada conta mostra "R$ X reservado para metas", quando houver
```

**Lista:** um cartão por meta com nome, ícone do tipo, barra `role="meter"` com texto ("R$ 3.200 de R$ 10.000, 32%"), situação com ícone e texto e o mês provável.

**Detalhe:**

- Progresso, falta, contribuição necessária (com data) e o ritmo usado, com a frase de onde ele veio.
- Quando fora do prazo: a explicação e as três opções como links para a edição pré-preenchida.
- "Simular": campo de valor mensal e o resultado ao lado, sem salvar (formulário GET, sem JavaScript obrigatório).
- "Reservar" e "Resgatar": valor, conta (padrão: a conta da meta) e data. O formulário mostra o não reservado da conta.
- Movimentos em ordem de data, com conta e tipo.
- "Concluir" quando atingida; "Arquivar" sempre, com diálogo que diz quanto será liberado e de quais contas.

**Texto fixo** no formulário de reserva: "Reservar não move dinheiro entre contas. Se quiser o dinheiro numa conta separada, registre também a transferência."

**Tela inicial:** cartão "Metas" com até três metas ativas (prioridade, depois data-alvo), barra e situação; ou "Nenhuma meta ainda" com link para criar.

---

## 9. Testes

1. **Unitários e de propriedade** sobre `domain/goal.ts`: as seis invariantes de 6.8; meses restantes com `month_start_day` diferente de 1; data-alvo no período atual; ritmo pela média com resgates; sem ritmo; prazo vencido; arredondamento da necessária.
2. **Integração:** aporte acima do não reservado recusado; resgate acima da reserva recusado; aporte em meta concluída ou arquivada recusado; concluir e arquivar geram `liberacao` e zeram a reserva; reserva em conta excluída não entra em `reservaParaDesconto`; dois aportes concorrentes na mesma conta não passam do saldo; saldo que cai depois do aporte gera o aviso e não apaga a reserva.
3. **Constraint:** meta e movimento com conta de outro usuário recusados (T20); `UPDATE` e `DELETE` em `goal_allocations` recusados; sinal do valor coerente com o tipo; alvo zero ou negativo recusado; RLS cruzada (T3).

---

## 10. Segurança

Nenhuma fronteira nova. O que entra:

- RLS forçada e chaves compostas por usuário nas duas tabelas (T3 e T20 estendidas, com teste).
- `goal_allocations` só inserção, como trilha (T-imutabilidade, mesma linha da 007).
- `audit_events` ganha `meta.criada`, `meta.alterada`, `meta.aporte`, `meta.resgate`, `meta.concluida` e `meta.arquivada`, **sem valor nem nome da meta**.
- O teste de log da T7 ganha o fluxo de metas. O nome da meta é texto do usuário e entra no teste de XSS de renderização.

---

## 11. Decisões (aprovadas pelas recomendações)

1. **Forma da reserva derivada da conta.** Virtual ou segregada sai de `include_in_available`; não existe combinação que desconte duas vezes. Contribuição futura é só plano.
2. **Reservado é soma de movimentos só-inserção.** Corrigir é movimento oposto; o histórico nunca muda.
3. **Contribuição recorrente é plano, não automação.** Não cria recorrência nem reserva sozinha (§3, princípio 3). Gerar o aporte mensal automaticamente pode vir depois, ligado às recorrências.
4. **Reservar não move dinheiro.** Transferência continua sendo lançamento à parte; a tela avisa. Criar os dois juntos fica para depois.
5. **Aporte limitado ao saldo não reservado, no banco.** Saldo que cai depois só gera aviso.
6. **Mês financeiro como unidade** de contribuição e de data provável, igual ao orçamento.
7. **Ritmo:** contribuição planejada, senão média dos três últimos meses completos.
8. **Concluir é decisão da pessoa**, mesmo com a meta atingida; concluir e arquivar liberam a reserva.

---

## 12. Fora de escopo nesta fatia

Dinheiro livre e o desconto efetivo (fatia 5), aporte automático mensal, transferência criada junto com a reserva, vínculo com dívidas, alocação para orçamento, rendimento da reserva, metas compartilhadas, sugestão de meta por IA.

---

## 13. Critérios de pronto

1. O usuário cria, edita, conclui e arquiva metas de qualquer tipo.
2. Reserva e resgate funcionam, com histórico só-inserção, e respeitam o saldo não reservado.
3. A meta mostra falta, percentual, contribuição necessária, ritmo usado e mês provável.
4. Fora do prazo, a tela explica a diferença e oferece as três opções, que só pré-preenchem o formulário.
5. A simulação não grava nada.
6. `reservaParaDesconto` desconta só reservas em contas incluídas; as seis invariantes de 6.8 passam em teste de propriedade.
7. Tela inicial e contas mostram as metas e as reservas.
8. Situação por texto e ícone; barra com `role="meter"` e texto equivalente.
9. Nenhum valor nem nome de meta em log ou em `audit_events`.
