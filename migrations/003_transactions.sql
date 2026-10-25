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
