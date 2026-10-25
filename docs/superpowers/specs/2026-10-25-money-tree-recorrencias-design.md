# Money Tree — Design da Fatia 2: Recorrências

**Data:** 2026-10-25
**Contrato de produto:** `PRODUCT.md` v0.2
**Depende de:** Fatia 1 (`2026-09-18-money-tree-nucleo-design.md`), concluída
**Escopo:** regras de repetição, ocorrências previstas, vencimentos e próximas contas
**Estado:** aprovado em 2026-10-25 com as cinco recomendações da seção 12

---

## 1. Contexto

A fatia 1 entregou o razão: contas, lançamentos, categorias, saldos e conciliação. Hoje, quem paga aluguel todo dia 5 precisa registrar o aluguel todo mês, à mão, e o sistema não sabe que ele vem. Sem isso, as próximas fatias não têm de onde tirar o que está comprometido: orçamento, metas e, principalmente, dinheiro livre (§6.2) dependem de saber quais obrigações estão por vir.

Ao fim desta fatia, o usuário consegue:

- dizer que uma despesa, receita ou transferência se repete;
- ver as ocorrências futuras aparecerem sozinhas como previstas, nunca como pagas;
- ver na tela inicial o que vence nos próximos 30 dias e o que está atrasado;
- pagar uma ocorrência confirmando o valor real, quando ele varia;
- pular uma ocorrência, editar só uma ou mudar a série dali em diante;
- pausar ou encerrar uma regra sem perder o histórico.

Ordem das fatias, mantida: recorrências → orçamentos → metas → dinheiro livre e dashboard → gráficos.

---

## 2. O que o PRODUCT.md pede, e o que esta fatia entrega

O §5.6 lista sete comportamentos. Esta fatia entrega cinco, um em versão mínima, e adia dois.

| §5.6 | Nesta fatia | Por quê |
|---|---|---|
| Recorrências semanais, mensais, anuais ou personalizadas | **Sim** | Núcleo da fatia |
| Criar ocorrências previstas, sem marcá-las como pagas | **Sim** | Núcleo da fatia |
| Editar só uma ocorrência ou toda a série | **Sim** | Ver 6.4; "toda a série" vira "desta em diante" |
| Alertar sobre vencimentos próximos e atrasos | **Na tela**, sem notificação | Notificação é canal novo (e-mail, push), com consentimento próprio; fica para fatia de alertas |
| Detectar mudança incomum no valor de uma conta recorrente | **Sim**, regra determinística | Aviso informativo ao pagar; não é IA (§7 segue desabilitado) |
| Reserva mensal sugerida para despesa anual | **Sim**, só exibida | Reservar de verdade é alocação, que pertence à fatia de metas |
| Mostrar um calendário financeiro | **Adiado** | Roadmap o coloca na Fase 2; aqui entra a agenda dos próximos 30 dias |
| Detectar possíveis recorrências a partir do histórico | **Adiado** | Heurística com falso positivo; fica com sugestões (Fase 3) |
| Assinaturas sem uso | **Adiado** | Fase 2, "Assinaturas" |

---

## 3. Correções herdadas da fatia 1

Duas falhas da fatia 1 não aparecem no uso atual e passam a aparecer com recorrências. Elas entram como primeira tarefa do plano, antes de qualquer código novo.

### 3.1 Liquidar transferência prevista liquida um lado só

`atualizarStatus` atualiza a linha pedida. Numa transferência prevista, marcar um lado como pago deixa o outro previsto: o dinheiro sai da origem e não entra no destino, e o total muda, violando a invariante do §6.2. Hoje é raro, porque quase toda transferência nasce liquidada. Com "guardar R$ 500 na poupança todo mês", aconteceria todo mês.

**Correção:** mudança de estado em lançamento com `transfer_group_id` vale para o grupo inteiro, na mesma transação, como já acontece no estorno. Teste de propriedade: liquidar qualquer lado de uma transferência prevista nunca altera o total.

### 3.2 O banco não impede editar lançamento liquidado

O role da aplicação tem `UPDATE` em `transactions`, e nada no banco impede mudar valor, conta ou data de uma linha liquidada. Hoje só a disciplina do código protege: o repositório só altera o estado. Esta fatia introduz edição de ocorrências; sem defesa no banco, um erro de código reescreveria histórico em silêncio, o que o §5.3 proíbe.

**Correção:** gatilho `transactions_imutavel_apos_liquidar`. Em linha com estado `liquidado`, `conciliado` ou `estornado`, só podem mudar `status`, `settled_date` (na transição permitida) e `updated_at`. Qualquer outra coluna alterada levanta exceção que manda estornar. Teste de constraint para cada coluna protegida.

---

## 4. Decisão central: ocorrências gravadas, geradas sob demanda

Há duas formas de fazer uma ocorrência existir.

**A. Virtual.** A regra é a única coisa gravada; as ocorrências são calculadas na leitura e só viram linha quando o usuário age sobre elas. Nunca fica dado velho. Mas toda consulta que lista lançamentos, filtra, pagina ou soma obrigações precisa juntar linhas reais com calculadas, inclusive dentro do SQL das próximas fatias.

**B. Gravada.** Cada ocorrência é uma linha em `transactions`, com estado `previsto`. Tudo que já existe passa a funcionar sem mudança: lista, filtros, paginação, "atrasado", liquidar, estornar. O risco é o que a fatia 1 apontou ao derivar `atrasado`: um processo periódico que falha deixa o dado mentindo.

**Escolha: B, sem processo periódico.** A geração não é um job. Ela roda no caminho da requisição, é idempotente e incremental:

- cada regra guarda `generated_until`, a última data já gerada;
- ao abrir qualquer página do app, `garantirOcorrencias(userId)` gera o que falta até `hoje + 90 dias` e avança `generated_until` na mesma transação;
- com a regra em dia, o custo é uma consulta que não devolve nada;
- a chave única `(recurrence_rule_id, occurrence_date, direction)` faz duas requisições simultâneas gerarem a mesma ocorrência uma vez só (`ON CONFLICT DO NOTHING`).

Se a geração falhar, nada fica mentindo: falta uma ocorrência futura que a próxima requisição cria. Não existe estado a ser "virado" por alguém.

**Horizonte de 90 dias.** Cobre o mês corrente e os dois seguintes, que é o que a tela de próximas contas e o dinheiro livre vão usar. A projeção de 365 dias (Fase 2) calcula a partir das regras no domínio, sem gravar um ano de linhas. Uma regra diária gera no máximo 90 linhas.

---

## 5. Schema — migração 007

### 5.1 `recurrence_rules`

| Campo | Regra |
|---|---|
| `user_id` | RLS forçada, como toda tabela |
| `kind` | `receita`, `despesa`, `transferencia`. Ajuste não se repete |
| `description` | obrigatória; vira a descrição das ocorrências |
| `account_id` | conta (ou origem, na transferência) |
| `to_account_id` | só na transferência; diferente de `account_id` |
| `category_id` | nulo na transferência |
| `nature` | obrigatória em receita e despesa; padrão `fixa` |
| `amount_cents` | `bigint > 0` |
| `amount_is_estimate` | `boolean`. Conta de luz: o valor é uma estimativa, confirmada ao pagar |
| `unit` | `dia`, `semana`, `mes`, `ano` |
| `interval` | inteiro de 1 a 366. "A cada 2 semanas" é `semana` + 2 |
| `start_date` | primeira ocorrência; âncora de todas as outras |
| `day_of_month` | só em `mes` e `ano`: o dia pretendido (1–31), guardado à parte para não derivar (ver 6.1) |
| `end_date` | opcional; "até" |
| `max_occurrences` | opcional; "por N vezes". No máximo um dos dois fins |
| `weekend_policy` | `manter` ou `proximo_dia_util` |
| `status` | `ativa`, `pausada`, `encerrada` |
| `paused_at` | data da pausa, quando pausada |
| `generated_until` | `date`; até onde já foi gerado |

Constraints: `kind = 'transferencia'` exige `to_account_id` e proíbe `category_id`; `day_of_month` não nulo exatamente quando `unit IN ('mes','ano')`; `end_date >= start_date`; `max_occurrences >= 1`; `end_date` e `max_occurrences` não coexistem; moeda implícita BRL, como nas contas.

### 5.2 Colunas novas em `transactions`

| Campo | Regra |
|---|---|
| `recurrence_rule_id` | FK opcional, `ON DELETE RESTRICT` |
| `occurrence_date` | data **nominal** da ocorrência, antes de ajuste de fim de semana. Não nulo exatamente quando há regra |
| `due_date` | vencimento. Opcional em lançamento avulso; nas ocorrências, é a data nominal já ajustada |
| `is_exception` | ocorrência editada individualmente; a série não mexe mais nela |

`UNIQUE (recurrence_rule_id, occurrence_date, direction) WHERE recurrence_rule_id IS NOT NULL` dá a idempotência. A direção entra porque uma transferência gera duas linhas na mesma data, uma de cada lado.

`due_date` entra agora porque o §12 pede competência, pagamento e vencimento como campos distintos, e a fatia de cartões vai precisar dele. A derivação de atrasado passa a usar `coalesce(due_date, competence_date)`; lançamento avulso continua igual.

### 5.3 Gatilho e funções

- `transactions_imutavel_apos_liquidar` (seção 3.2).
- `create_transfer` ganha os parâmetros opcionais `p_rule_id` e `p_occurrence_date`, com padrão nulo. A assinatura antiga continua funcionando.
- Liquidação e cancelamento de transferência pelo grupo (seção 3.1).

---

## 6. Domínio — `src/domain/recurrence.ts`

TypeScript puro, sem banco, como o resto do domínio.

### 6.1 Cálculo das datas

`ocorrencias(regra, de, ate): { nominal: IsoDate; vencimento: IsoDate }[]`

Cada ocorrência é calculada a partir da âncora, `start_date + k × interval`, **nunca a partir da anterior**. Somar um mês ao resultado anterior deriva: 31/jan → 28/fev → 28/mar → 28/abr, e o aluguel do dia 31 passa a vencer no 28 para sempre. Por isso `day_of_month` fica guardado à parte.

Regras de calendário:

- **Dia que não existe no mês** (31 em abril, 29 em fevereiro não bissexto) vira o último dia do mês. No mês seguinte que tiver o dia, volta a ele.
- **Anual em 29/fev** cai em 28/fev nos anos não bissextos.
- **Fim de semana**, com `proximo_dia_util`: sábado e domingo passam para a segunda. A data nominal não muda; só o vencimento. Assim, duas ocorrências diárias empurradas para a mesma segunda continuam sendo duas.
- **Feriados não entram nesta fatia** (ver 12.3).
- Fim por `end_date` compara a data **nominal**. Fim por `max_occurrences` limita o índice `k` da sequência a partir da âncora: ocorrência pulada ou caída numa pausa conta do mesmo jeito. "Por 12 vezes" termina na 12ª data do calendário da regra, e pular uma não estende a série.

### 6.2 Invariantes, como testes de propriedade (fast-check)

1. Toda data devolvida está em `[de, ate]`, em `[start_date, end_date]`, e a sequência é estritamente crescente pela data nominal.
2. **Partição:** gerar `[a, c]` é igual a gerar `[a, b]` e depois `(b, c]`, para qualquer `b`. É o que torna a geração incremental com `generated_until` correta.
3. **Sem deriva:** numa regra mensal com `day_of_month = d`, toda ocorrência cai em `d` ou no último dia de um mês mais curto que `d`.
4. Com `proximo_dia_util`, nenhum vencimento cai em sábado ou domingo, e nenhum fica antes da data nominal nem mais de 2 dias depois.
5. `max_occurrences = n` nunca produz mais de `n` ocorrências, qualquer que seja a janela.

### 6.3 Texto da regra

`descreverRegra(regra): string` produz o texto da tela: "Todo dia 5", "Toda sexta-feira", "A cada 2 semanas, às segundas", "Todo ano em 15 de março", "Todo dia 31 (ou o último dia do mês)". O texto é testado caso a caso, porque é o que a pessoa lê para confirmar que configurou certo.

### 6.4 Editar só uma, desta em diante, ou toda a série

O §5.6 pede "editar apenas uma ocorrência ou toda a série". Toda a série, ao pé da letra, inclui ocorrências já pagas, que o §5.3 proíbe reescrever. Por isso as opções são:

- **Só esta.** Altera a linha e marca `is_exception = true`. A série nunca mais mexe nela. Só vale enquanto a ocorrência está prevista ou pendente.
- **Desta em diante.** A regra antiga ganha `end_date` na véspera; uma regra nova começa nesta data com os valores novos. Se a antiga tinha `max_occurrences`, a nova herda o que restava, para "12 parcelas" continuar sendo 12 no total. As ocorrências futuras da antiga que ainda não foram tocadas (previstas, sem exceção) são apagadas, e a nova as gera. O que já foi pago, cancelado ou editado individualmente fica como está.

`planejarEdicaoSerie(regra, aPartirDe, mudancas)` devolve o que muda, sem I/O. Invariante testada: **nenhuma ocorrência liquidada, conciliada, estornada, cancelada ou de exceção é alterada ou apagada por edição de série.**

### 6.5 Pular, pausar, encerrar

- **Pular** cancela a ocorrência (`status = cancelado`). A linha fica, e é ela que impede a geração de recriá-la. Por isso uma ocorrência **nunca é apagada**: apagar faria a próxima requisição gerá-la de novo. O "desfazer" logo após criar uma ocorrência também cancela, em vez de apagar.
- **Pausar** apaga as ocorrências futuras ainda não tocadas e para de gerar. Ao retomar, `generated_until` volta para ontem e a geração recomeça de hoje: a janela pausada não é preenchida para trás.
- **Encerrar** define `end_date = hoje` e apaga as futuras não tocadas. Regra encerrada não volta; para recomeçar, cria-se outra. Regra nunca é apagada, porque as ocorrências pagas apontam para ela.

### 6.6 Valor variável e aviso de valor incomum

Em regra com `amount_is_estimate`, a ocorrência aparece com o selo "≈ estimado". Ao pagar, o formulário pede o valor real, preenchido com a estimativa.

`valorIncomum(pago, historico): Aviso | null` compara o valor pago com a **mediana dos últimos 3 pagamentos** da mesma regra. Acima de 25% de diferença, mostra um aviso informativo: "R$ 312,40, 31% acima do habitual (mediana de R$ 238,50 nos últimos 3 meses)". Mediana em vez de média, para um mês atípico não distorcer a referência. Sem pelo menos 3 pagamentos, não há aviso. Diferença calculada em centavos inteiros. O aviso não bloqueia nada, não muda a regra e não é IA.

### 6.7 Reserva mensal sugerida

Para regras com `unit = 'ano'`, ou `mes` com `interval >= 3`, a tela da regra mostra: "Para ter R$ 1.200,00 em 15 de março, separe R$ 240,00 por mês nos próximos 5 meses."

O valor é `amount / meses até a próxima ocorrência`, arredondado **para cima** em centavos: a reserva precisa bastar. É só texto. Separar o dinheiro de verdade é alocação, que pertence à fatia de metas, e só lá entra no dinheiro livre sem dupla contagem.

---

## 7. Dados — `src/data/recurrences.ts`

- `criarRegra`, `atualizarRegra` (via `planejarEdicaoSerie`), `pausarRegra`, `retomarRegra`, `encerrarRegra`, `listarRegras`, `buscarRegra`.
- `garantirOcorrencias(userId)`: lê as regras ativas com `generated_until < hoje + 90`, calcula no domínio e insere com `ON CONFLICT DO NOTHING`. Transferência passa por `create_transfer`. Tudo numa transação por regra, com `generated_until` avançando junto.
- `proximasContas(userId, dias)`: ocorrências e lançamentos avulsos previstos ou pendentes com vencimento até `hoje + dias`, mais os atrasados, em ordem de vencimento.

Limites de proteção (seção 10): no máximo 200 regras ativas por usuário, intervalo mínimo de 1 dia, e no máximo 1.000 ocorrências geradas por chamada.

---

## 8. Telas

```
/                       ganha "Próximas contas": atrasadas primeiro, depois 30 dias
/recorrencias           regras ativas, pausadas e encerradas, com a próxima ocorrência
/recorrencias/nova      criar regra
/recorrencias/[id]      editar, pausar, retomar, encerrar; ocorrências passadas e futuras
/lancamentos/novo       ganha "Repetir" (ver abaixo)
/lancamentos/[id]       numa ocorrência: pagar com valor real, pular, editar só esta,
                        editar a série
/lancamentos            ícone ↻ e filtro "recorrentes"
```

**"Repetir" no formulário de lançamento.** O §5.3 trata recorrência como atributo do lançamento, não como cadastro à parte. Ligar "Repetir" mostra frequência, intervalo e fim. Ao salvar, a regra nasce com `start_date` igual à data do lançamento, e o próprio lançamento vira a primeira ocorrência, mesmo se já nasceu pago. Antes de salvar, o formulário mostra o texto da regra e as três próximas datas, para a pessoa conferir.

**Próximas contas, na tela inicial.** Lista agrupada por data, com selo de estado e "Pagar" direto na linha. Duas somas separadas e rotuladas: "a pagar em 30 dias" (despesas) e "a receber em 30 dias" (receitas). Transferências aparecem na lista, mas fora das somas, porque não são gasto. Não há conta de dinheiro livre aqui: ela pertence à fatia 5, e uma soma aproximada agora seria o tipo de número sem explicação que o §6.2 proíbe.

**Pergunta de escopo ao editar.** Toda alteração numa ocorrência abre um diálogo próprio (§13): "Só esta" ou "Desta em diante". Para liquidada, o diálogo nem aparece: resta estornar, como na fatia 1.

Acessibilidade, estados de carregando e erro, preservação de valores após erro e confirmação de ações destrutivas seguem a fatia 1 e o redesign já feito. "Atrasado" continua com texto e ícone, e continua visível no celular.

---

## 9. Testes

1. **Unitários e de propriedade** sobre `domain/recurrence.ts`: as cinco invariantes de 6.2, `descreverRegra` caso a caso, `planejarEdicaoSerie`, `valorIncomum` (inclusive sem histórico e com mediana zero) e a reserva sugerida (sempre suficiente e nunca fracionária).
2. **Integração**:
   - `garantirOcorrencias` chamada duas vezes, e em paralelo, gera cada ocorrência uma vez só;
   - pular e depois gerar de novo não recria a ocorrência pulada;
   - "desta em diante" não toca em pago, cancelado nem exceção;
   - recorrência de transferência gera os dois lados, e liquidar um liquida os dois;
   - RLS em `recurrence_rules`: um usuário não vê, gera nem edita regra de outro.
3. **Constraint**: o gatilho de imutabilidade recusa mudar cada coluna protegida de um lançamento liquidado; o banco recusa regra de transferência sem destino, `day_of_month` fora de 1–31 e fim duplo.
4. **Invariante financeira nova**: gerar ocorrências **nunca altera saldo**. Previsto não move saldo, e o teste de propriedade sobre `calcularSaldo` ganha linhas vindas de regra.

---

## 10. Segurança: ameaças novas

Entram no `docs/seguranca/modelo-de-ameacas.md`, cada uma com teste:

| # | Ameaça | Mitigação | Verificação |
|---|---|---|---|
| T17 | Ocorrência duplicada por requisições simultâneas | `UNIQUE` + `ON CONFLICT DO NOTHING`; `generated_until` na mesma transação | Teste com chamadas em paralelo |
| T18 | Regra que gera linhas sem fim (intervalo de 1 dia, sem fim, muitas regras) esgota o banco | Horizonte de 90 dias, até 200 regras ativas, até 1.000 ocorrências por chamada | Teste dos três limites |
| T19 | Edição de série reescreve histórico pago | `planejarEdicaoSerie` exclui o que foi tocado; gatilho de imutabilidade como segunda defesa | Teste de propriedade e de constraint |
| T20 | Regra apontando para conta ou categoria de outro usuário | RLS nas FKs; `create_transfer` segue `SECURITY INVOKER` | Teste de RLS com IDs de outro usuário |

`audit_events` ganha `regra.criada`, `regra.editada`, `regra.pausada`, `regra.encerrada` e `ocorrencia.pulada`, sem valor, descrição nem frequência, como na fatia 1.

---

## 11. Fora de escopo nesta fatia

Calendário mensal em grade, detecção de recorrências pelo histórico, assinaturas, notificações (e-mail, push, alertas persistentes), feriados, dinheiro livre e "valor comprometido" no sentido do §6.2, alocação de reserva, projeção de 365 dias, parcelas de cartão (fatia de cartões, que vai reaproveitar `due_date`) e recorrência de ajuste.

Nenhum deles exige mudar o schema desta fatia para ser adicionado depois.

---

## 12. Decisões a confirmar antes do plano

Cada uma tem uma recomendação. O plano parte dela se não houver objeção.

1. **Horizonte de geração: 90 dias.** Mais curto deixa a tela de próximas contas sem o mês seguinte; mais longo multiplica as linhas que uma edição de série precisa apagar e refazer.
2. **Fim de semana: padrão `proximo_dia_util` para despesa, `manter` para receita.** Boleto que vence no sábado pode ser pago na segunda sem multa; salário que cai no sábado costuma ser antecipado, e prometer a segunda seria otimista. A pessoa troca por regra.
3. **Feriados: fora desta fatia.** Os nacionais fixos são fáceis, mas Carnaval e Corpus Christi são móveis, e os municipais variam por cidade. Um calendário pela metade erraria em silêncio. Até lá, o vencimento ignora feriados e a tela diz isso.
4. **Primeira ocorrência no passado: até 60 dias.** Quem cadastra o aluguel no dia 10, com vencimento no dia 5, quer ver a ocorrência deste mês (atrasada) para marcar como paga. Mais de 60 dias para trás geraria um monte de atrasadas que a pessoa já pagou e registrou à mão.
5. **Aviso de valor incomum: 25%, mediana dos últimos 3.** Abaixo disso, a variação normal de luz e água gera aviso todo mês e o aviso perde o valor.

---

## 13. Critérios de pronto

A fatia está concluída quando:

1. As duas correções herdadas (seção 3) estão feitas e testadas.
2. O usuário cria uma recorrência pelo formulário de lançamento e pela tela de recorrências, e confere o texto da regra e as próximas datas antes de salvar.
3. Ocorrências aparecem como previstas até 90 dias à frente, sem job, sem duplicar e sem mexer no saldo.
4. As cinco invariantes de data passam em teste de propriedade.
5. Pagar uma ocorrência de valor estimado pede o valor real e avisa quando ele foge do habitual.
6. Pular, editar só uma, editar desta em diante, pausar, retomar e encerrar funcionam, e nenhuma delas toca em ocorrência paga.
7. Transferência recorrente gera os dois lados e se liquida inteira.
8. A tela inicial mostra atrasadas e próximos 30 dias, com as somas de pagar e receber separadas e rotuladas.
9. As ameaças T17 a T20 estão no modelo de ameaças, cada uma com teste.
10. Nenhum valor, descrição ou frequência aparece em log ou em `audit_events`.
11. As telas novas passam em verificação de teclado e leitor de tela, e "Atrasado" e "≈ estimado" são comunicados por texto.
