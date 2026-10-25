-- Up Migration

create type recurrence_unit   as enum ('dia', 'semana', 'mes', 'ano');
create type weekend_policy    as enum ('manter', 'proximo_dia_util');
create type recurrence_status as enum ('ativa', 'pausada', 'encerrada');

/*
 * Regras de recorrência (spec da fatia 2, seção 5.1).
 *
 * `series_id` é a identidade da série. "Desta em diante" termina a regra
 * antiga e cria uma nova na mesma série; a chave única das ocorrências fica
 * na série, para a regra nova não recriar uma data que a antiga ocupa com
 * ocorrência pulada ou editada.
 */
create table recurrence_rules (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references users (id) on delete cascade,
  series_id           uuid not null default gen_random_uuid(),

  kind                transaction_kind not null,
  description         text not null,
  account_id          uuid not null,
  to_account_id       uuid,
  category_id         uuid,
  nature              transaction_nature,
  amount_cents        bigint not null,
  amount_is_estimate  boolean not null default false,

  -- "interval" é palavra reservada do SQL; o nome evita aspas em toda consulta.
  unit                recurrence_unit not null,
  interval_count      smallint not null default 1,
  start_date          date not null,
  day_of_month        smallint,
  end_date            date,
  max_occurrences     integer,
  weekend_policy      weekend_policy not null default 'manter',

  status              recurrence_status not null default 'ativa',
  paused_at           date,
  generated_until     date,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint rr_id_user_unico unique (id, user_id),
  constraint rr_id_serie_user_unico unique (id, series_id, user_id),

  -- Referências só para dado do mesmo usuário (T20), como na migração 008.
  constraint rr_conta_do_mesmo_usuario
    foreign key (account_id, user_id) references accounts (id, user_id) on delete restrict,
  constraint rr_destino_do_mesmo_usuario
    foreign key (to_account_id, user_id) references accounts (id, user_id) on delete restrict,
  constraint rr_categoria_do_mesmo_usuario
    foreign key (category_id, user_id) references categories (id, user_id) on delete restrict,

  constraint rr_kind_repetivel check (kind in ('receita', 'despesa', 'transferencia')),
  constraint rr_descricao_nao_vazia check (length(btrim(description)) > 0),
  constraint rr_valor_positivo check (amount_cents > 0),
  constraint rr_intervalo check (interval_count between 1 and 366),

  constraint rr_transferencia_coerente check (
    (kind = 'transferencia' and to_account_id is not null and to_account_id <> account_id
       and category_id is null and nature is null)
    or
    (kind <> 'transferencia' and to_account_id is null and nature is not null)
  ),

  -- "is not null" explícito: em CHECK, NULL conta como aprovado, e
  -- "day_of_month between 1 and 31" com dia nulo dá NULL.
  constraint rr_dia_do_mes check (
    (unit in ('mes', 'ano') and day_of_month is not null and day_of_month between 1 and 31)
    or
    (unit in ('dia', 'semana') and day_of_month is null)
  ),

  constraint rr_fim_unico check (end_date is null or max_occurrences is null),
  constraint rr_fim_depois_do_inicio check (end_date is null or end_date >= start_date),
  constraint rr_vezes_positivas check (max_occurrences is null or max_occurrences >= 1),
  constraint rr_pausa_coerente check ((status = 'pausada') = (paused_at is not null))
);

create index rr_usuario_ativas on recurrence_rules (user_id) where status = 'ativa';

/* Vínculo das ocorrências (spec 5.2). */
alter table transactions
  add column recurrence_rule_id   uuid,
  add column recurrence_series_id uuid,
  add column occurrence_date      date,
  add column due_date             date,
  add column is_exception         boolean not null default false;

alter table transactions
  -- A ocorrência pertence a uma regra do mesmo usuário, e a série gravada é
  -- a da regra: a chave composta garante as duas coisas de uma vez.
  add constraint transactions_regra_do_mesmo_usuario
    foreign key (recurrence_rule_id, recurrence_series_id, user_id)
    references recurrence_rules (id, series_id, user_id) on delete restrict,

  add constraint transactions_ocorrencia_coerente check (
    (recurrence_rule_id is null and recurrence_series_id is null and occurrence_date is null)
    or
    (recurrence_rule_id is not null and recurrence_series_id is not null and occurrence_date is not null)
  ),

  add constraint transactions_excecao_so_em_ocorrencia check (
    not is_exception or recurrence_rule_id is not null
  );

-- Idempotência da geração (T17): uma data da série, uma vez. A direção
-- entra porque a transferência grava dois lados na mesma data.
create unique index transactions_ocorrencia_unica
  on transactions (recurrence_series_id, occurrence_date, direction)
  where recurrence_series_id is not null;

create index transactions_regra on transactions (recurrence_rule_id)
  where recurrence_rule_id is not null;

create index transactions_vencimento on transactions (user_id, coalesce(due_date, competence_date))
  where status in ('previsto', 'pendente');

/*
 * create_transfer ganha o vínculo de ocorrência. Os parâmetros novos têm
 * padrão nulo, então a chamada antiga continua valendo. DROP antes do
 * CREATE porque o Postgres não muda a lista de parâmetros no lugar.
 * Continua SECURITY INVOKER: a RLS de quem chama vale.
 */
drop function create_transfer(uuid, uuid, uuid, bigint, text, date, date, transaction_status, text);

create function create_transfer(
  p_user_id         uuid,
  p_from_account    uuid,
  p_to_account      uuid,
  p_amount_cents    bigint,
  p_description     text,
  p_competence_date date,
  p_settled_date    date,
  p_status          transaction_status,
  p_notes           text,
  p_rule_id         uuid default null,
  p_occurrence_date date default null,
  p_due_date        date default null
) returns uuid
language plpgsql
as $$
declare
  v_grupo uuid := gen_random_uuid();
  v_serie uuid;
begin
  if p_from_account = p_to_account then
    raise exception 'Origem e destino não podem ser a mesma conta'
      using errcode = 'check_violation';
  end if;

  if p_rule_id is not null then
    select series_id into v_serie from recurrence_rules where id = p_rule_id;
  end if;

  insert into transactions
    (user_id, account_id, kind, description, notes, amount_cents, direction,
     status, competence_date, settled_date, transfer_group_id,
     recurrence_rule_id, recurrence_series_id, occurrence_date, due_date)
  values
    (p_user_id, p_from_account, 'transferencia', p_description, p_notes,
     p_amount_cents, -1, p_status, p_competence_date, p_settled_date, v_grupo,
     p_rule_id, v_serie, p_occurrence_date, p_due_date),
    (p_user_id, p_to_account, 'transferencia', p_description, p_notes,
     p_amount_cents, 1, p_status, p_competence_date, p_settled_date, v_grupo,
     p_rule_id, v_serie, p_occurrence_date, p_due_date);

  return v_grupo;
end;
$$;

alter table recurrence_rules enable row level security;
alter table recurrence_rules force  row level security;

create policy recurrence_rules_proprio on recurrence_rules
  using (user_id = app_user_id()) with check (user_id = app_user_id());

-- Sem DELETE: regra não se apaga, porque ocorrências pagas apontam para ela.
grant select, insert, update on recurrence_rules to money_tree_app;
grant execute on function create_transfer(
  uuid, uuid, uuid, bigint, text, date, date, transaction_status, text, uuid, date, date
) to money_tree_app;

-- Down Migration

drop function if exists create_transfer(uuid, uuid, uuid, bigint, text, date, date, transaction_status, text, uuid, date, date);
drop index if exists transactions_vencimento;
drop index if exists transactions_regra;
drop index if exists transactions_ocorrencia_unica;
alter table transactions
  drop constraint if exists transactions_excecao_so_em_ocorrencia,
  drop constraint if exists transactions_ocorrencia_coerente,
  drop constraint if exists transactions_regra_do_mesmo_usuario,
  drop column if exists is_exception,
  drop column if exists due_date,
  drop column if exists occurrence_date,
  drop column if exists recurrence_series_id,
  drop column if exists recurrence_rule_id;
drop table if exists recurrence_rules;
drop type if exists recurrence_status;
drop type if exists weekend_policy;
drop type if exists recurrence_unit;

-- Devolve a create_transfer da migração 004.
create function create_transfer(
  p_user_id uuid, p_from_account uuid, p_to_account uuid, p_amount_cents bigint,
  p_description text, p_competence_date date, p_settled_date date,
  p_status transaction_status, p_notes text
) returns uuid
language plpgsql
as $$
declare
  v_grupo uuid := gen_random_uuid();
begin
  if p_from_account = p_to_account then
    raise exception 'Origem e destino não podem ser a mesma conta'
      using errcode = 'check_violation';
  end if;

  insert into transactions
    (user_id, account_id, kind, description, notes, amount_cents, direction,
     status, competence_date, settled_date, transfer_group_id)
  values
    (p_user_id, p_from_account, 'transferencia', p_description, p_notes,
     p_amount_cents, -1, p_status, p_competence_date, p_settled_date, v_grupo),
    (p_user_id, p_to_account, 'transferencia', p_description, p_notes,
     p_amount_cents, 1, p_status, p_competence_date, p_settled_date, v_grupo);

  return v_grupo;
end;
$$;

grant execute on function create_transfer(uuid, uuid, uuid, bigint, text, date, date, transaction_status, text)
  to money_tree_app;
