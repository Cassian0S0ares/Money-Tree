# Modelo de ameaças — Money Tree, Fatia 1 (Núcleo)

**Data:** 2026-09-18
**Escopo:** contas, lançamentos, categorias e saldos
**Exigido por:** `PRODUCT.md` v0.2, §11 — "antes da implementação e a cada mudança relevante"

Cada mitigação listada aqui precisa de teste automatizado ou procedimento verificável. Mitigação sem verificação é intenção, não controle.

---

## 1. Ativos

| Ativo | Onde vive | Por que importa |
|---|---|---|
| Razão de lançamentos | Postgres (Supabase, `sa-east-1`) | Retrato completo da vida financeira do usuário |
| Saldos e contas | Postgres | Revelam patrimônio e instituições usadas |
| Credencial do banco | `.env.local` na máquina do desenvolvedor | Acesso total ao razão |
| Hash de senha do usuário | Tabela `users` | Reuso de senha em outros serviços |
| Cookie de sessão | Navegador do usuário | Sequestro de conta |
| Trilha de auditoria | Tabela `audit_events` | Não repúdio; alvo de adulteração |
| Backups | Fora do repositório, cifrados | Cópia integral do razão |

## 2. Atores

- **Usuário legítimo** — pode errar, pode querer desfazer.
- **Pessoa com acesso físico ao dispositivo** — sessão aberta e destravada.
- **Invasor remoto** — pela superfície web da aplicação.
- **Extensão de navegador maliciosa** — roda no mesmo contexto da página.
- **Dependência comprometida** — via cadeia de suprimentos npm.
- **Supabase como provedor** — enxerga o dado em texto aberto (desvio 3.2 da spec).
- **Provedor de IA** — fora de escopo nesta fatia; IA desabilitada.

## 3. Fronteiras de confiança

```
Navegador  ──①──  Servidor Next.js  ──②──  Supavisor (pooler)  ──③──  Postgres
    │                    │
    └── extensões        └── .env.local, sistema de arquivos local
```

1. **Navegador → servidor:** tudo que chega é não confiável, inclusive o que o próprio formulário enviou.
2. **Servidor → pooler:** TLS obrigatório; credencial nunca deixa o servidor.
3. **Pooler → Postgres:** RLS aplicada pelo banco, não pela aplicação.

Quarta fronteira, implícita: **Git**. Somente código e documentação atravessam. Nenhum dado financeiro, nenhum segredo.

---

## 4. Ameaças e mitigações

### STRIDE aplicado à fatia

| # | Ameaça | Categoria | Mitigação | Verificação |
|---|---|---|---|---|
| T1 | Sequestro de sessão por roubo de token | Falsificação | Cookie `HttpOnly`/`Secure`/`SameSite=Lax`; nada em `localStorage`; rotação do ID ao autenticar | `tests/unit/cookie-sessao.test.ts` (HttpOnly, SameSite=Lax, Secure em produção, validade) e `tests/unit/entrar-rotacao.test.ts` (o token anterior é revogado ao entrar) |
| T2 | Força bruta na senha | Falsificação | argon2id com parâmetros versionados; limitação de tentativas por conta e por origem | `tests/unit/rate-limit.test.ts` e `tests/unit/entrar-limite-origem.test.ts`: 5 falhas por conta, 20 por origem, e sucesso não zera a origem. Limitações aceitas: contagem em memória (zera ao reiniciar, não vale entre instâncias) e IP lido de `x-forwarded-for`, confiável só atrás de proxy que o reescreve |
| T3 | Um usuário lê dado de outro | Elevação de privilégio | `FORCE ROW LEVEL SECURITY`; role `money_tree_app` sem bypass; `SET LOCAL app.user_id` por transação | `tests/integration/001-base.test.ts`, `with-user.test.ts`, `004-saldos-transferencia.test.ts` (view com `security_invoker`), `auth.test.ts` (caminho anterior ao login) |
| T4 | Bug na aplicação esquece o filtro por usuário | Exposição | Mesma RLS de T3 — a defesa não depende do código da aplicação | `tests/integration/001-base.test.ts` e `auth.test.ts`: sem `app.user_id`, o role da aplicação não lê nenhuma linha |
| T5 | XSS via descrição ou estabelecimento | Adulteração | Escape em toda renderização; texto do banco tratado como não confiável ao ser lido; CSP restritiva sem script remoto | `tests/unit/item-lancamento.test.ts` (carga de XSS renderizada sai escapada; conferido por mutação), `tests/unit/interface-proibicoes.test.ts` (sem `dangerouslySetInnerHTML`) e CSP com nonce em `src/middleware.ts` |
| T6 | Apagar lançamento liquidado para esconder histórico | Repúdio | Gatilho de banco bloqueia `DELETE` em `liquidado`/`conciliado`/`estornado`; correção só via estorno vinculado | `tests/integration/003-transactions.test.ts` e `repo-transactions.test.ts` |
| T7 | Valor financeiro vaza em log | Exposição | Logger com redação; `audit_events` sem valores nem descrições | `tests/integration/log-sem-valores.test.ts` (fluxo completo e erro de banco impresso inteiro, sem valor nem descrição), `tests/unit/logger.test.ts` (redação, inclusive `detail`/`query`/`parameters`), `tests/integration/004-saldos-transferencia.test.ts` e `audit.test.ts` |
| T8 | Credencial do banco commitada | Exposição | `.gitignore` antes do primeiro commit; `.env.example` só com placeholders; spec sem credencial nem ref do projeto | `scripts/verificar-segredos.ts` no CI e no pre-commit (`.githooks/pre-commit`, ativado com `git config core.hooksPath .githooks`); regras testadas em `tests/unit/verificar-segredos.test.ts` |
| T9 | Saldo errado por ponto flutuante | Adulteração | `bigint` de centavos no banco; tipo marcado `Cents` no domínio; float proibido no módulo de dinheiro | `tests/unit/money.test.ts` e `balance.test.ts` (propriedades) |
| T10 | Transferência grava um lado só | Adulteração | Função SQL cria os dois lados em uma transação | `tests/integration/004-saldos-transferencia.test.ts` e `acoes-lancamentos.test.ts` (estorno atinge os dois lados) |
| T11 | Reimportação duplica lançamentos | Adulteração | UNIQUE `(user_id, source, external_id)` | `tests/integration/003-transactions.test.ts` |
| T12 | Acesso físico ao dispositivo com sessão aberta | Elevação de privilégio | Bloqueio automático por inatividade; reautenticação antes de exportar ou excluir | `tests/integration/auth.test.ts` (ociosidade e expiração). Reautenticação antes de exportar ou excluir: não há exportação nesta fatia |
| T13 | Dependência npm comprometida | Adulteração | Lockfile fixado; atualização controlada; auditoria de vulnerabilidade no CI | `scripts/auditoria.mjs` no CI (`.github/workflows/ci.yml`): falha em alto/crítico fora das exceções registradas. Exceções atuais: PostCSS do Next 15 (sai com o Next 16) e Vitest 3 (sai com o Vitest 4) |
| T14 | Indisponibilidade do Supabase | Indisponibilidade | Nenhuma nesta fatia — risco aceito (desvio 3.1 da spec) | **Risco aceito.** Sem teste |
| T15 | Provedor lê o dado financeiro | Exposição | Nenhuma — risco aceito e documentado (desvio 3.2 da spec) | **Risco aceito.** Sem teste |
| T16 | Falsificação de requisição entre sites | Falsificação | Validação de origem das Server Actions do Next.js, mantida ligada; `SameSite=Lax` | `tests/unit/middleware.test.ts`: POST sem Origin, de outra origem ou de host parecido recebe 403; conferido também contra o servidor rodando |
| T17 | Ocorrência recorrente duplicada por requisições simultâneas | Adulteração | Chave única por série, data nominal e direção, com `ON CONFLICT DO NOTHING`; linha da regra travada com `skip locked`; `generated_until` avança na mesma transação | `tests/integration/repo-recurrences.test.ts` (três gerações em paralelo; transferência repetida), `tests/integration/009-recorrencias.test.ts` (chave única) |
| T18 | Regra que gera linhas sem fim esgota o banco | Indisponibilidade | Horizonte de 90 dias, no máximo 200 regras ativas por usuário e 1.000 ocorrências por chamada, continuando na seguinte | `tests/integration/repo-recurrences.test.ts` (201ª regra recusada; 1.092 ocorrências geradas em duas chamadas de 1.000 e 92) |
| T19 | Edição de série ou de ocorrência reescreve histórico pago | Repúdio | `planejarEdicaoSerie` só substitui ocorrência prevista e não editada; gatilho `transactions_imutavel_apos_liquidar` recusa mudar qualquer coluna de linha liquidada, conciliada ou estornada | `tests/unit/recurrence-serie.test.ts` (propriedade), `tests/integration/repo-recurrences-serie.test.ts` (paga, pulada e editada atravessam um "desta em diante"), `tests/integration/007-imutabilidade.test.ts` |
| T20 | Referência a conta, categoria ou regra de outro usuário | Elevação de privilégio | A checagem de chave estrangeira ignora a RLS; todas as referências viraram chaves compostas `(coluna, user_id)` (migrações 008 e 009), inclusive as da fatia 1 | `tests/integration/fk-cruzada.test.ts`, `tests/integration/009-recorrencias.test.ts` |

---

## 5. Riscos residuais aceitos

1. **O provedor enxerga tudo** (T15). Consequência direta de calcular saldo em SQL. Reavaliar se o produto migrar para banco local.
2. **Sem internet, sem dado** (T14). Consequência direta de abandonar local-first.
3. **Extensão maliciosa no navegador** lê a página autenticada. Fora do alcance de uma aplicação web; mitigado apenas por CSP e por não manter segredo no cliente.
4. **Máquina do desenvolvedor comprometida** expõe `.env.local`. Mitigar com criptografia de disco e rotação da senha do banco ao menor sinal de exposição.

---

## 6. Quando revisar

- Ao adicionar importação de arquivo (entrada não confiável nova).
- Ao habilitar qualquer IA externa (nova fronteira de dados).
- Ao expor a aplicação fora de `localhost`.
- Ao adicionar segundo usuário ou compartilhamento.
- Ao trocar provedor de banco ou região.
