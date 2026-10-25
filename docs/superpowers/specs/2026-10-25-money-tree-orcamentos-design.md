# Money Tree — Design da Fatia 3: Orçamentos

**Data:** 2026-10-25
**Contrato de produto:** `PRODUCT.md` v0.2
**Depende de:** Fatias 1 (núcleo) e 2 (recorrências), concluídas
**Escopo:** limite de gasto por categoria e mês financeiro, acumulação de sobra, ritmo e previsão de estouro
**Estado:** aprovado em 2026-10-25 com as recomendações da seção 11 (mesmo critério da fatia 2)

---

## 1. Contexto

Com as fatias 1 e 2, o Money Tree sabe quanto existe em cada conta e o que vence nos próximos dias. Ainda não sabe **quanto a pessoa pretende gastar** com cada coisa, nem avisa quando um gasto está fora do ritmo antes de o mês acabar.

Ao fim desta fatia, o usuário consegue:

- definir quanto quer gastar por mês em cada categoria de despesa;
- ver, para o mês financeiro corrente e os anteriores, quanto planejou, quanto já gastou, quanto está comprometido e quanto resta;
- saber se está no ritmo esperado para o dia do mês;
- ver, com antecedência, se a categoria vai estourar e em quanto;
- deixar a sobra de um mês acumular para o seguinte;
- mudar o limite daqui em diante sem reescrever os meses passados.

Ordem das fatias, mantida: recorrências → **orçamentos** → metas → dinheiro livre e dashboard → gráficos.

---

## 2. O que o PRODUCT.md pede, e o que esta fatia entrega

| §5.5 | Nesta fatia | Por quê |
|---|---|---|
| Orçamento por categoria | **Sim** | Núcleo da fatia |
| Valor planejado, utilizado, restante e percentual | **Sim** | — |
| Ritmo esperado para o dia atual do período | **Sim** | Seção 6.3 |
| Previsão de estouro | **Sim**, determinística | Seção 6.4. Não é IA: a previsão por IA é da Fase 3 |
| Saldo não utilizado acumula, quando ativado | **Sim** | Seção 6.2 |
| Situação com texto e ícone, nunca só cor | **Sim** | — |
| Envelope: **reservar dinheiro já existente** | **Parcial** (decisão 1) | Separar dinheiro é alocação, que nasce com metas |
| Método flexível (essenciais, estilo de vida, metas) | **Adiado** (decisão 2) | Agrupamento novo de categorias; cabe depois sem mudar o schema |

### 2.1 Envelope sem separar dinheiro, por enquanto

O §5.5 recomenda o envelope, que **reserva dinheiro existente** para cada finalidade, e o princípio 1 do §3 diz que o orçamento parte do saldo real. Separar dinheiro é alocação (`allocations`, §12). Alocação também é o que metas usam (§5.8), e ela precisa entrar no dinheiro livre exatamente uma vez (§6.2). Fazer isso aqui puxaria metade das fatias de metas e de dinheiro livre.

Esta fatia entrega o comportamento de envelope que não depende de dinheiro separado: o limite mensal e a **acumulação de sobra**, que é o que distingue envelope de teto simples. A tela diz com clareza que orçamento, por enquanto, é **plano de gasto** e não separa dinheiro. Quando alocações existirem, um orçamento pode ganhar dinheiro de verdade sem migração destrutiva: a alocação aponta para o orçamento.

---

## 3. Decisões de cálculo

### 3.1 Período

O período é o **mês financeiro** do usuário (`month_start_day`, fatia 1, `mesFinanceiro`). Com início no dia 5, o período de outubro vai de 05/10 a 04/11.

### 3.2 O que conta como gasto

Base de **competência**, como o §6.4 manda para orçamento.

| Lançamento | Conta? | Em quê |
|---|---|---|
| Despesa `liquidado` ou `conciliado` | Sim | **Realizado** |
| Despesa `previsto` ou `pendente` | Sim | **Comprometido**, separado do realizado |
| Despesa `estornado` | Não | O estorno anulou o gasto; a linha de estorno não tem categoria |
| Despesa `cancelado` | Não | — |
| Receita, transferência, ajuste | Não | Não são gasto (§4) |

Ocorrências previstas de recorrência (fatia 2) entram como comprometido do mês em que vencem pela competência: o aluguel do mês já aparece reservado no orçamento de Moradia antes de ser pago.

### 3.3 Categoria e subcategoria

Orçamento só em **categoria-raiz de despesa**, e soma o gasto da raiz e de todas as subcategorias. Orçamento em subcategoria abriria a dupla contagem que o §6.2 proíbe (o mesmo gasto em "Transporte" e em "Combustível").

---

## 4. Schema — migração 010

### 4.1 `budgets`

Um orçamento por categoria.

| Campo | Regra |
|---|---|
| `user_id` | RLS forçada |
| `category_id` | categoria-raiz de despesa do mesmo usuário (FK composta, como na fatia 2) |
| `rollover` | `boolean`; acumula sobra para o mês seguinte |
| `rollover_since` | data a partir da qual acumula (início do período em que foi ligado) |
| `archived_at` | orçamento removido; o histórico de limites fica |

`UNIQUE (user_id, category_id) WHERE archived_at IS NULL`. Um gatilho recusa categoria com `parent_id` ou `kind = 'receita'`.

### 4.2 `budget_limits`

O limite é **datado**, para mudar daqui em diante sem reescrever o passado.

| Campo | Regra |
|---|---|
| `budget_id` | FK composta |
| `starts_on` | `date`; o limite vale a partir do período que começa nesta data |
| `amount_cents` | `bigint >= 0` |

`UNIQUE (budget_id, starts_on)`. O limite de um período é o da linha com o maior `starts_on <= início do período`. Mudar o limite de outubro em diante insere uma linha; setembro continua com o limite que tinha.

---

## 5. Arquitetura

Como nas fatias anteriores: `src/domain/budget.ts` puro, `src/data/budgets.ts` com o SQL, telas em `src/app/(app)/orcamentos/`.

---

## 6. Domínio — `src/domain/budget.ts`

### 6.1 Limite vigente

`limiteVigente(limites, inicioDoPeriodo): Cents | null`. Nulo quando o orçamento ainda não existia naquele período.

### 6.2 Acumulação

Com `rollover`, o **disponível** de um período é o limite mais a sobra do anterior:

```text
disponivel(p) = limite(p) + max(0, disponivel(p-1) - realizado(p-1))
```

Só a **sobra** acumula; estouro não vira dívida para o mês seguinte (decisão 4). A cadeia começa em `rollover_since`. Antes dele, ou com `rollover` desligado, `disponivel(p) = limite(p)`.

O comprometido não entra na sobra. Ele vira realizado quando é pago, e a conta é feita sobre o que aconteceu.

### 6.3 Ritmo

```text
esperado_hoje = disponivel × dias_decorridos / dias_do_periodo
```

`dias_decorridos` conta o dia de hoje. A situação de ritmo, com tolerância de 10% do disponível (decisão 6):

- **abaixo do ritmo**: realizado < esperado − 10%;
- **no ritmo**: dentro da faixa;
- **acima do ritmo**: realizado > esperado + 10%.

Período passado não tem ritmo; tem resultado.

### 6.4 Previsão de estouro

Extrapolar o realizado inteiro erraria feio: o aluguel pago no dia 5 não se repete no dia 20. Por isso só o gasto **variável** é projetado:

```text
taxa_variavel = realizado_variavel / dias_decorridos
previsto      = realizado + comprometido + taxa_variavel × dias_restantes
estouro       = max(0, previsto − disponivel)
```

O gasto fixo entra como aconteceu, e o que já está previsto (recorrências, contas pendentes) entra como comprometido. Assim nada é contado duas vezes. A previsão só aparece depois de **7 dias** de período (decisão 5): com 2 dias de dados, uma compra grande vira "estouro de R$ 4.000" e o aviso perde o valor.

### 6.5 Situação

Em ordem de gravidade, sempre com ícone e texto:

| Situação | Quando | Texto |
|---|---|---|
| **Estourado** | realizado > disponível | "Estourou em R$ X" |
| **Vai estourar** | previsão > disponível | "No ritmo atual, estoura em R$ X" |
| **Atenção** | realizado + comprometido > disponível, ou acima do ritmo | "Comprometido passa do limite" ou "Gastando acima do ritmo" |
| **Dentro** | o resto | "Dentro do orçamento" |

Limite zero é válido ("não quero gastar nada com isso") e qualquer gasto estoura.

### 6.6 Invariantes, como teste de propriedade

1. **Sem dupla contagem:** a soma do realizado de todas as categorias-raiz é igual ao total de despesas realizadas com categoria no período.
2. **Acumulação:** o disponível nunca é menor que o limite e nunca carrega estouro.
3. **Previsão:** previsto ≥ realizado + comprometido, e com taxa variável zero é exatamente igual.
4. **Passado imutável:** mudar o limite a partir de um período não altera o limite vigente nem o disponível de nenhum período anterior a ele.
5. **Estorno:** um gasto estornado não aparece no realizado.

---

## 7. Dados — `src/data/budgets.ts`

- `criarOrcamento(userId, { categoryId, amountCents, aPartirDe, rollover })`
- `alterarLimite(userId, budgetId, amountCents, aPartirDe)`: insere ou atualiza a linha daquele `starts_on`.
- `definirAcumulacao(userId, budgetId, ligado, aPartirDe)`
- `removerOrcamento(userId, budgetId)`: arquiva.
- `resumoOrcamento(userId, periodo, hoje)`: para cada categoria-raiz de despesa, realizado (fixo e variável), comprometido e a avaliação do domínio para as que têm orçamento. Uma consulta agrupa o gasto por categoria-raiz e por data desde o início do orçamento mais antigo; o domínio distribui pelos períodos, para a acumulação.

---

## 8. Telas

```
/orcamentos                 mês financeiro corrente; anterior e próximo por link
/orcamentos?inicio=AAAA-MM-DD   outro período
/                           ganha "Orçamento do mês": as categorias que pedem atenção
```

**Página de orçamentos:**

- Resumo do período: total planejado, realizado, comprometido e restante, e o dia do período ("dia 21 de 31").
- Uma linha por categoria com orçamento: barra de progresso **com texto** ("R$ 412 de R$ 600, 69%"), marca do ritmo esperado, comprometido em faixa distinta, situação com ícone e texto, e a previsão quando houver.
- Categorias de despesa **sem** orçamento, com o gasto do período e "Definir limite", para a pessoa ver onde o dinheiro vai mesmo sem planejar.
- Definir ou mudar limite num formulário curto, com a pergunta "a partir de qual mês" (este mês por padrão) e a opção de acumular sobra.
- Aviso fixo: "Orçamento é um plano de gasto. Ele ainda não separa dinheiro das contas."

**Tela inicial:** um cartão "Orçamento do mês" com até três categorias em pior situação e o link para a página. Se tudo está dentro, diz isso em uma linha.

A barra de progresso não depende de cor: o percentual e a situação estão escritos, e `role="meter"` com `aria-valuetext` dá o mesmo ao leitor de tela.

---

## 9. Testes

1. **Unitários e de propriedade** sobre `domain/budget.ts`: as cinco invariantes de 6.6, ritmo nos limites da tolerância, previsão antes e depois do 7º dia, limite zero, período passado sem ritmo.
2. **Integração:** subcategoria soma na raiz; estornado e cancelado fora; ocorrência prevista vira comprometido; mudar limite daqui em diante preserva o passado; acumulação ao longo de três meses; mudança de `month_start_day` não quebra a busca do limite.
3. **Constraint:** orçamento em subcategoria ou em categoria de receita é recusado; categoria de outro usuário é recusada (T20); limite negativo é recusado.

---

## 10. Segurança

Nenhuma fronteira nova: orçamento é dado do próprio usuário, lido e escrito pelas mesmas camadas. O que entra:

- RLS forçada e chaves compostas por usuário nas duas tabelas novas (T3 e T20 estendidas, com teste).
- `audit_events` ganha `orcamento.criado`, `orcamento.limite_alterado`, `orcamento.acumulacao_alterada` e `orcamento.removido`, sem valor.
- O teste de log da T7 ganha o fluxo de orçamento.

---

## 11. Decisões (aprovadas pelas recomendações)

1. **Envelope sem separar dinheiro nesta fatia.** Limite mensal e acumulação de sobra agora; dinheiro reservado de verdade chega com alocações, na fatia de metas. A tela avisa.
2. **Método flexível adiado.** Agrupar categorias em essenciais, estilo de vida e metas é útil, mas é um agrupamento novo; cabe numa fatia futura sem mudar este schema.
3. **Orçamento só em categoria-raiz**, somando as subcategorias. Evita dupla contagem.
4. **Acumula só a sobra.** Estouro não vira dívida no mês seguinte: carregar o negativo empurra a pessoa para meses impossíveis.
5. **Previsão de estouro a partir do 7º dia**, projetando só o gasto variável.
6. **Tolerância de ritmo de 10% do disponível.** Menos que isso, uma compra de supermercado muda o estado todo dia.

---

## 12. Fora de escopo nesta fatia

Separação de dinheiro (alocações), método flexível, orçamento semanal ou anual, orçamento de receita, notificações de estouro, sugestão de limite pelo histórico (Fase 3), e dinheiro livre.

---

## 13. Critérios de pronto

1. O usuário define, muda (daqui em diante) e remove o limite de uma categoria-raiz de despesa.
2. A página mostra planejado, realizado, comprometido, restante, percentual, ritmo e previsão para o mês corrente, e navega para os anteriores.
3. Subcategoria soma na raiz; estornado e cancelado não contam; ocorrência prevista conta como comprometido.
4. A acumulação leva a sobra, e só a sobra, para o mês seguinte.
5. As cinco invariantes de 6.6 passam em teste de propriedade.
6. Mudar o limite não altera nenhum mês anterior.
7. A tela inicial mostra as categorias que pedem atenção.
8. Situação comunicada por texto e ícone; barra com `role="meter"` e texto equivalente.
9. Nenhum valor em log ou em `audit_events`.
