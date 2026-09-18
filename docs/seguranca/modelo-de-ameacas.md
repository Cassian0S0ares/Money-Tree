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
| T1 | Sequestro de sessão por roubo de token | Falsificação | Cookie `HttpOnly`/`Secure`/`SameSite=Lax`; nada em `localStorage`; rotação do ID ao autenticar | Teste que assere os atributos do cookie e a rotação |
| T2 | Força bruta na senha | Falsificação | argon2id com parâmetros versionados; limitação de tentativas por conta e por origem | Teste de bloqueio após N tentativas |
| T3 | Um usuário lê dado de outro | Elevação de privilégio | `FORCE ROW LEVEL SECURITY`; role `money_tree_app` sem bypass; `SET LOCAL app.user_id` por transação | Teste de integração: usuário A consulta e não enxerga linha de B |
| T4 | Bug na aplicação esquece o filtro por usuário | Exposição | Mesma RLS de T3 — a defesa não depende do código da aplicação | Teste que roda consulta sem filtro e ainda assim não vaza |
| T5 | XSS via descrição ou estabelecimento | Adulteração | Escape em toda renderização; texto do banco tratado como não confiável ao ser lido; CSP restritiva sem script remoto | Teste com carga maliciosa gravada e depois renderizada |
| T6 | Apagar lançamento liquidado para esconder histórico | Repúdio | Gatilho de banco bloqueia `DELETE` em `liquidado`/`conciliado`/`estornado`; correção só via estorno vinculado | Teste de constraint que espera falha no `DELETE` |
| T7 | Valor financeiro vaza em log | Exposição | Logger com redação; `audit_events` sem valores nem descrições | Teste que grava lançamento e varre a saída de log em busca do valor |
| T8 | Credencial do banco commitada | Exposição | `.gitignore` antes do primeiro commit; `.env.example` só com placeholders; spec sem credencial nem ref do projeto | Verificação de segredos no pre-commit e no CI |
| T9 | Saldo errado por ponto flutuante | Adulteração | `bigint` de centavos no banco; tipo marcado `Cents` no domínio; float proibido no módulo de dinheiro | Teste de propriedade sobre rateio e soma |
| T10 | Transferência grava um lado só | Adulteração | Função SQL cria os dois lados em uma transação | Teste que força falha no segundo lado e assere que nenhum foi gravado |
| T11 | Reimportação duplica lançamentos | Adulteração | UNIQUE `(user_id, source, external_id)` | Teste de constraint com `external_id` repetido |
| T12 | Acesso físico ao dispositivo com sessão aberta | Elevação de privilégio | Bloqueio automático por inatividade; reautenticação antes de exportar ou excluir | Teste de expiração por inatividade |
| T13 | Dependência npm comprometida | Adulteração | Lockfile fixado; atualização controlada; auditoria de vulnerabilidade no CI | CI falha em vulnerabilidade de severidade alta |
| T14 | Indisponibilidade do Supabase | Indisponibilidade | Nenhuma nesta fatia — risco aceito (desvio 3.1 da spec) | Estado "offline" exibido corretamente |
| T15 | Provedor lê o dado financeiro | Exposição | Nenhuma — risco aceito e documentado (desvio 3.2 da spec) | — |
| T16 | Falsificação de requisição entre sites | Falsificação | Validação de origem das Server Actions do Next.js, mantida ligada; `SameSite=Lax` | Teste com origem forjada |

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
