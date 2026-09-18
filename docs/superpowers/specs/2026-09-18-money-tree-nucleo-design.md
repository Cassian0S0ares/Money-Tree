# Money Tree — Design da Fatia 1: Núcleo

**Data:** 2026-09-18
**Contrato de produto:** `PRODUCT.md` v0.2
**Escopo:** contas, lançamentos, categorias e saldos
**Estado:** aprovado para gerar plano de implementação

---

## 1. Contexto

`PRODUCT.md` v0.2 descreve o Money Tree inteiro, em quatro fases. A Fase 1 sozinha tem onze entregáveis — grande demais para uma spec única. Este documento cobre apenas a primeira fatia: o núcleo que torna o sistema utilizável de verdade.

Ao fim desta fatia, um usuário consegue: entrar no sistema, cadastrar suas contas, registrar receitas, despesas, transferências e ajustes, organizá-los em categorias, conciliar o saldo de uma conta com o extrato e ver quanto tem em cada conta e no total.

Fatias seguintes, nesta ordem: recorrências → orçamentos → metas → dinheiro livre e dashboard → gráficos. Cada uma ganha sua própria spec e seu próprio plano.

---

## 2. Decisões tomadas

| Decisão | Escolha | Referência |
|---|---|---|
| Onde roda | Aplicação web local, banco em Supabase gerenciado | §18.1, §18.4 |
| Stack | Next.js + TypeScript + Tailwind | — |
| Usuários | Individual agora, schema com `user_id` desde já | §18.2 |
| Onde mora a lógica | Server-first: Server Components e Server Actions; domínio em TS puro | — |
| Banco | Postgres 17 no Supabase, região `sa-east-1` (São Paulo) | — |
| IA | Desabilitada nesta fatia | §18.5, §7.3.1 |
| Git | Somente código e documentação; nenhum dado financeiro | §18.3, §11 |

### Por que server-first

A alternativa era o navegador falar direto com o banco. Isso tornaria a RLS a única defesa e colocaria regra de negócio financeira em código que o usuário controla. Com Server Actions, a credencial do banco nunca sai do servidor, a lógica roda onde não pode ser adulterada, e a RLS vira a segunda linha de defesa em vez da única.

A atomicidade que o Postgres faz melhor — os dois lados de uma transferência — fica em função SQL. O resto fica em TypeScript, onde é testável em milissegundos.

---

## 3. Desvios do PRODUCT.md

O §11 permite outro modelo de confiança desde que a decisão seja documentada e o risco aceito explicitamente. Estes são os desvios, com o risco que carregam.

### 3.1 Cloud em vez de local-first

**O que o contrato pede** (§2, §11): dados no dispositivo do usuário, acessíveis sem internet.

**O que fazemos:** Postgres gerenciado pelo Supabase é a fonte de verdade.

**Risco aceito:** sem internet, o sistema não abre nenhum dado. Indisponibilidade do provedor é indisponibilidade total. Os dados ficam sob custódia de um terceiro.

**Mitigação:** nenhuma nesta fatia. Cache local de leitura é possível em fatia futura, sem alterar o schema.

### 3.2 Sem criptografia de ponta a ponta em repouso

**O que o contrato pede** (§11): banco com criptografia autenticada cuja chave o servidor não possui.

**Por que não é possível:** o saldo é calculado com `SUM()` no Postgres. Para somar, o servidor precisa enxergar o número. Criptografia que o servidor não abre e agregação em SQL são mutuamente exclusivas.

**O que fazemos:** TLS em trânsito, criptografia de disco do provedor em repouso, RLS por usuário, menor privilégio no role da aplicação.

**Risco aceito:** o provedor, ou quem comprometer o provedor, consegue ler valores financeiros em texto aberto.

**Alternativa descartada:** calcular saldos no cliente sobre dados cifrados. Inviabiliza filtro, ordenação e paginação no banco, e não escala com o histórico.

### 3.3 Sem bloqueio criptográfico local

O §11 pede chave local, bloqueio de banco e detecção de falha de integridade. Sem banco local, não há o que cifrar no dispositivo. Permanecem: bloqueio de sessão por inatividade e reautenticação antes de operação sensível.

---

## 4. Arquitetura

```
src/domain/   TypeScript puro. Sem I/O, sem SQL, sem React.
src/data/     Repositórios. Único lugar do código com SQL.
src/app/      Next.js. Orquestra, nunca calcula.
```

A dependência aponta só para dentro: `app` conhece `data`, `data` conhece `domain`, `domain` não conhece ninguém. Regra de lint bloqueia importação de `pg` ou `react` dentro de `domain/` — se o domínio precisar de banco para ser testado, a fronteira já foi rompida.

Cada módulo de domínio responde três perguntas sem que se leia seu interior: o que faz, como se usa, do que depende.

---

## 5. Schema

Todas as tabelas: `id uuid` como chave, `user_id uuid` referenciando `users`, `created_at`/`updated_at` em `timestamptz` UTC, RLS ligada com `FORCE`.

Valores monetários em `bigint` de centavos. Nunca ponto flutuante (§12). Datas financeiras em `date`, preservando a data civil; horários técnicos em `timestamptz` UTC (§12).

### 5.1 `users`

Um registro nesta fatia, estrutura pronta para vários.

`id`, `email` (único, case-insensitive), `password_hash` (argon2id), `display_name`, `locale` (padrão `pt-BR`), `timezone` (padrão `America/Sao_Paulo`), `currency` (padrão `BRL`), `month_start_day` (padrão 1), `is_active`.

### 5.2 `sessions`

O §11 exige cookie `HttpOnly`/`Secure`/`SameSite` com rotação, e proíbe token em `localStorage`. A sessão vive no banco.

`id`, `user_id`, `token_hash`, `expires_at`, `last_seen_at`, `revoked_at`, `user_agent_hash`, `ip_hash`. Nunca o token em claro, nunca o IP em claro.

### 5.3 `accounts`

`name`, `type`, `institution`, `initial_balance_cents`, `initial_balance_date`, `currency`, `is_liquid`, `include_in_available`, `include_in_net_worth`, `is_archived`, `last_reconciled_at`.

`type`: `corrente`, `pagamento`, `poupanca`, `carteira`, `cartao_credito`, `investimento`, `emprestimo`, `outro`.

Regras:

- Arquivar nunca apaga histórico (§5.2).
- `is_liquid` e `include_in_available` são coisas diferentes e ambos existem de propósito. `is_liquid` descreve o ativo: o dinheiro pode ser usado hoje. `include_in_available` é escolha do usuário: ele quer que essa conta entre no cálculo. O §6.1 soma apenas contas que são líquidas **e** incluídas — uma poupança líquida que o usuário prefere não contar fica de fora.
- `cartao_credito`, `investimento` e `emprestimo` nascem com `include_in_available = false`. Limite de crédito não é dinheiro disponível (§5.7).
- `currency` aceita apenas `BRL` nesta versão, por CHECK. O campo existe para evolução; o §5.2 proíbe habilitar outra moeda antes de definir cotação, instante de conversão, arredondamento e tratamento de ganho cambial.

### 5.4 `categories`

`name`, `parent_id` (auto-referência, um nível de subcategoria), `kind` (`receita`/`despesa`), `is_archived`, `is_system`, `sort_order`.

As catorze categorias do §5.5 entram como seed na criação do usuário, todas editáveis e arquiváveis.

### 5.5 `transactions`

O razão de lançamentos é a fonte de verdade histórica (§5.3.1). Cada linha pertence a exatamente uma conta.

| Campo | Regra |
|---|---|
| `account_id` | obrigatório |
| `kind` | `receita`, `despesa`, `transferencia`, `ajuste` |
| `nature` | `fixa`/`variavel`, apenas quando `kind` é receita ou despesa; nulo nos demais (§5.3) |
| `amount_cents` | `bigint`, CHECK `> 0`. O tipo determina o efeito contábil, não o sinal |
| `direction` | `smallint`, `+1` ou `-1` |
| `signed_amount_cents` | coluna gerada: `amount_cents * direction` |
| `status` | `previsto`, `pendente`, `liquidado`, `conciliado`, `cancelado`, `estornado` |
| `competence_date` | `date`, obrigatória |
| `settled_date` | `date`, nula até liquidar |
| `category_id` | nulo para transferência |
| `counterparty` | pessoa ou estabelecimento, opcional |
| `notes` | opcional |
| `transfer_group_id` | liga os dois lados de uma transferência |
| `adjustment_reason` | obrigatório quando `kind = 'ajuste'` (§5.3.1) |
| `source` | `manual`, `importacao`, `integracao`, `ia` |
| `external_id` | identificador idempotente da origem (§5.3) |

Constraints:

- `kind = 'receita'` exige `direction = +1`; `kind = 'despesa'` exige `direction = -1`.
- `kind = 'transferencia'` exige `transfer_group_id` não nulo e `category_id` nulo.
- `kind = 'ajuste'` exige `adjustment_reason` preenchido.
- `status IN ('liquidado','conciliado')` exige `settled_date` não nulo.
- `nature` não nulo apenas quando `kind IN ('receita','despesa')`.
- UNIQUE `(user_id, source, external_id)` quando `external_id` não é nulo — reimportar o mesmo extrato não duplica (§5.3).

`atrasado` **não** é um valor de `status`. É derivado: vencimento no passado e não liquidado. Estado gravado exigiria um processo periódico para virá-lo, e um processo que falha deixa o dado mentindo. Derivar é sempre verdade.

### 5.6 `ledger_reversals`

Vínculo imutável entre o lançamento original e seu estorno (§12).

`original_transaction_id` (único), `reversal_transaction_id`, `reason`, `created_at`.

Um gatilho bloqueia `DELETE` de qualquer linha com `status IN ('liquidado','conciliado','estornado')`. A única correção possível é o estorno (§5.3). Lançamento apenas `previsto` ou `pendente` pode ser apagado, com confirmação.

### 5.7 `reconciliations`

O §5.3.1 exige distinguir saldo calculado, informado, conciliado e a diferença entre eles.

`account_id`, `reported_balance_cents`, `reported_at`, `calculated_balance_cents` (congelado no instante), `difference_cents`, `decision` (`ajuste_criado`, `lancamento_localizado`, `duplicidade_removida`, `adiado`), `adjustment_transaction_id`, `note`.

Conciliar nunca reescreve lançamento anterior. Divergência vira decisão explícita do usuário.

### 5.8 `audit_events`

Desde o primeiro dia, com o conteúdo mínimo do §11.

`event_type`, `occurred_at` (UTC), `actor_ref` (pseudônimo), `object_type`, `object_ref` (pseudônimo), `source`, `result`, `error_code`, `correlation_id`.

Nunca valor, descrição, estabelecimento, token, prompt ou credencial.

### 5.9 View `account_balances`

```
saldo_calculado = initial_balance_cents
                + SUM(signed_amount_cents) FILTER (WHERE status IN ('liquidado','conciliado'))
```

Expõe também `is_estimated`: verdadeiro quando existe movimento posterior à última conciliação, ou quando a conta nunca foi conciliada. O §6.1 exige que saldo não conciliado seja identificado como estimado.

Apenas `liquidado` e `conciliado` movem o saldo. `previsto` e `pendente` ficam em buckets separados, consumidos pelo cálculo de dinheiro livre em fatia futura (§6.2).

### 5.10 Função `create_transfer`

O §5.3 exige que os dois lados sejam gravados, alterados, estornados e conciliados atomicamente. Uma função SQL cria as duas linhas — uma com `direction = -1` na conta de origem, outra com `direction = +1` no destino — com o mesmo `transfer_group_id`, dentro de uma transação. Se um lado falhar, nenhum existe.

Transferência entre contas incluídas não altera o total (§6.2). Por construção: a soma dos dois `signed_amount_cents` é zero.

---

## 6. Camada de domínio

### `domain/money.ts`

`Cents` como tipo marcado (`number & { readonly __cents: unique symbol }`), sempre inteiro. Parser de entrada pt-BR (`"1.234,56"` → `123456`), formatador via `Intl.NumberFormat`, e `rateio(total, partes)` que distribui o resto para que a soma das partes seja exatamente o total. Ponto flutuante não entra neste módulo.

### `domain/transaction.ts`

Máquina de estados explícita:

```
criação     → previsto | pendente | liquidado
previsto    → pendente | liquidado | cancelado
pendente    → liquidado | cancelado
liquidado   → conciliado | estornado
conciliado  → estornado
```

O lançamento pode nascer já `liquidado` — registrar uma despesa que acabou de ser paga é o caso mais comum, e obrigá-la a passar por `previsto` seria cerimônia inútil. `previsto → liquidado` direto também é permitido, pela mesma razão.

`cancelado` e `estornado` são terminais. Transição inválida é erro de tipo quando possível, e erro em tempo de execução quando não.

Também aqui: a derivação de `atrasado` e as invariantes de cada `kind`.

### `domain/balance.ts`

Recebe linhas do razão, devolve saldo calculado e `is_estimated`. Função pura: mesmo razão, mesmo resultado, sem banco.

### `domain/reconciliation.ts`

Saldo informado contra calculado, diferença e as opções de decisão do §5.3.1.

### `domain/dates.ts`

Competência contra liquidação, fuso do usuário contra UTC, e o início do mês financeiro configurável.

Validação de entrada com Zod na borda, em cada Server Action. O domínio assume dado válido e não revalida.

---

## 7. Telas e rotas

```
/entrar                       login
/                             saldos: total, por conta, aviso de estimado
/contas                       lista, saldo de cada, arquivar
/contas/nova, /contas/[id]    criar e editar
/contas/[id]/conciliar        informado → diferença → decisão
/lancamentos                  lista filtrada e paginada
/lancamentos/novo, /[id]      criar, editar, estornar
/categorias                   árvore, criar, editar, arquivar
/configuracoes                fuso, início do mês financeiro, perfil
```

### Formulário de lançamento

Um formulário, campos condicionais ao tipo. Receita e despesa pedem conta, categoria e natureza. Transferência pede origem e destino e oculta categoria. Ajuste exige motivo. A mesma validação Zod roda no cliente e no servidor.

Toda mutação é Server Action. O navegador nunca fala com o banco.

### Estados e erros (§13)

Toda área de dados prevê: carregando, sem dados ainda, filtro sem resultado, erro recuperável e offline. A mensagem de erro diz o que aconteceu, o que foi preservado e como corrigir. O formulário preserva valores após erro, aponta o primeiro campo inválido e impede envio duplicado.

### Desfazer

Após criar, um aviso com opção de desfazer. Se o lançamento ainda é `previsto` ou `pendente`, desfazer apaga. Se já foi liquidado, a opção não aparece — resta estornar, porque apagar liquidado é proibido (§5.3).

### Acessibilidade (§14)

Meta WCAG 2.2 AA, tratada como requisito e não como acabamento:

- Diálogo próprio para operação destrutiva, com foco preso e `Esc`. Nunca `alert`, `confirm` ou `prompt`.
- Estado nunca comunicado só por cor: ícone e texto sempre.
- Navegação completa por teclado, foco visível.
- Datas, moeda e números em `pt-BR`.
- Zoom de 200% sem perda de função; preferência de movimento reduzido respeitada.
- Responsivo, sem esconder informação financeira crítica no celular.

Texto de descrição, estabelecimento, etiqueta e observação é entrada não confiável (§5.3): escapado em toda renderização, e tratado como não confiável novamente ao ser lido do banco.

---

## 8. Testes

Desenvolvimento orientado a testes: o teste vem antes da implementação.

1. **Unitários (Vitest)** sobre o domínio. Sem banco, sem navegador, milissegundos.
2. **Baseados em propriedade (fast-check)** sobre as invariantes financeiras, que o §16 lista como entregável da Fase 1:
   - transferência entre contas incluídas nunca altera a soma total;
   - estorno anula exatamente o efeito do original;
   - rateio soma o total original, para qualquer valor e qualquer número de partes;
   - saldo independe da ordem de inserção dos lançamentos.
3. **Integração contra Postgres em Docker local**, nunca contra o Supabase. Migrações aplicadas do zero, banco descartável.
4. **Testes de constraint**, que provam que o banco rejeita: `amount_cents <= 0`, `DELETE` de linha liquidada, transferência sem par, ajuste sem motivo e `external_id` duplicado.

O item 4 existe porque uma defesa não testada é uma suposição.

---

## 9. Segurança operacional

### Roles do banco

| Role | Usada em | Poder |
|---|---|---|
| dono do schema | migrações, porta 5432 | cria e altera estrutura |
| `money_tree_app` | runtime, porta 6543 | `SELECT`/`INSERT`/`UPDATE` nas tabelas; sem `DROP`, sem bypass de RLS |

O usuário `postgres.<ref>` do Supabase é superusuário e ignora RLS. Se a aplicação conectasse com ele, a RLS seria decoração. A aplicação usa `money_tree_app`.

`FORCE ROW LEVEL SECURITY` em todas as tabelas. Cada requisição abre uma transação, executa `SET LOCAL app.user_id = $1`, e as policies filtram por `current_setting('app.user_id')`. Um bug no código da aplicação não vaza dado de outro usuário.

### Conexão

Duas portas, propósitos diferentes:

- **6543** — Supavisor em modo transação, usado pelo runtime. Não aceita prepared statements: o cliente precisa de `prepare: false`.
- **5432** — modo sessão, usado por migrações. Migração no pooler de transação quebra.

Host, porta, usuário e senha vivem apenas em `.env.local`, que está no `.gitignore` desde o primeiro commit. `.env.example` traz apenas placeholders. Este documento não registra credenciais nem o identificador do projeto, mesmo sendo o repositório privado.

### Sessão e autenticação

Senha com argon2id. Cookie `HttpOnly`, `Secure`, `SameSite=Lax`, com rotação do identificador após autenticar. Nada em `localStorage` (§11). Bloqueio automático por inatividade, configurável. Reautenticação antes de exportar, excluir ou revelar dado sensível.

### Log que não vaza

Logger com redação: sem valor, descrição, estabelecimento, token ou credencial. `audit_events` grava tipo, hora UTC, ator pseudônimo e resultado — nunca conteúdo.

CSP restritiva, nenhum script remoto, dependências travadas por lockfile.

### Modelo de ameaças

O §11 exige modelo de ameaças antes da implementação. Está em `docs/seguranca/modelo-de-ameacas.md`, e é revisto a cada mudança relevante.

### Backup

Nesta fatia: script `pg_dump` com saída cifrada e autenticada, chave fora do repositório, e o procedimento de restauração testado e documentado. O §17 trata restauração testada como critério de sucesso, não como intenção. A automação fica para fatia posterior.

---

## 10. Fora de escopo nesta fatia

Divisão de lançamento, recorrências, orçamentos, metas, alocações, dinheiro livre, limite diário, projeção, gráficos, patrimônio, cartão e fatura, parcelas, importação CSV e OFX, caixa de entrada, regras de classificação, notificações, cenários, inteligência artificial, PWA, sincronização e backup automatizado.

Nenhum deles exige alteração no schema desta fatia para ser adicionado depois.

---

## 11. Critérios de pronto

A fatia está concluída quando:

1. Um usuário entra, cadastra contas e registra os quatro tipos de lançamento.
2. O saldo de cada conta e o total conferem com o razão, e indicam quando são estimados.
3. Transferência cria dois lados atômicos e não altera o total.
4. Lançamento liquidado não pode ser apagado; corrigir gera estorno vinculado.
5. Conciliar mostra a diferença e exige decisão explícita.
6. As quatro invariantes financeiras passam em teste de propriedade.
7. Os testes de constraint provam que o banco rejeita dado inválido.
8. A RLS bloqueia acesso cruzado, comprovado por teste.
9. Nenhum valor ou descrição aparece em log ou em `audit_events`.
10. As telas passam em verificação de teclado, contraste e leitor de tela.
11. O modelo de ameaças está escrito e cada mitigação tem teste ou procedimento verificável.
12. A restauração de backup foi executada com sucesso ao menos uma vez.
