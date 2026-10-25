-- Up Migration

create type reconciliation_decision as enum (
  'lancamento_localizado', 'duplicidade_removida', 'ajuste_criado', 'adiado'
);

create table reconciliations (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references users (id) on delete cascade,
  account_id                uuid not null references accounts (id) on delete restrict,

  reported_balance_cents    bigint not null,
  reported_at               timestamptz not null default now(),
  -- Congelado no instante da conciliação: o saldo calculado muda depois, e
  -- o registro precisa preservar o que foi comparado.
  calculated_balance_cents  bigint not null,
  difference_cents          bigint generated always as
                              (reported_balance_cents - calculated_balance_cents) stored,

  decision                  reconciliation_decision not null,
  adjustment_transaction_id uuid references transactions (id) on delete restrict,
  note                      text,
  created_at                timestamptz not null default now()
);

create index reconciliations_conta on reconciliations (account_id, reported_at desc);

-- Só o mínimo do §11. Nenhuma coluna aqui pode carregar valor, descrição,
-- estabelecimento, token ou prompt.
create table audit_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users (id) on delete cascade,
  event_type      text not null,
  occurred_at     timestamptz not null default now(),
  actor_ref       text not null,
  object_type     text,
  object_ref      text,
  source          text not null,
  result          text not null,
  error_code      text,
  correlation_id  uuid
);

create index audit_events_usuario_tempo on audit_events (user_id, occurred_at desc);

/*
 * Saldo calculado por conta.
 *
 * Só `liquidado` e `conciliado` movem saldo (§6.1). `previsto` e `pendente`
 * ficam de fora e serão consumidos pelo cálculo de dinheiro livre em fatia
 * futura, como buckets separados — é assim que o §6.2 evita dupla contagem.
 *
 * `is_estimated` cumpre a exigência do §6.1: saldo ainda não conferido com
 * fonte externa precisa se anunciar como estimativa.
 *
 * `security_invoker` é obrigatório: view comum roda com os privilégios do
 * dono, e o dono da migração ignora RLS. Sem isso, qualquer usuário veria o
 * saldo de todos (ameaça T3).
 */
create view account_balances with (security_invoker = true) as
select
  a.id   as account_id,
  a.user_id,
  a.initial_balance_cents
    + coalesce(sum(t.signed_amount_cents) filter (
        where t.status in ('liquidado', 'conciliado')
      ), 0) as balance_cents,
  (
    a.last_reconciled_at is null
    or exists (
      select 1 from transactions posterior
      where posterior.account_id = a.id
        and posterior.status in ('liquidado', 'conciliado')
        and posterior.settled_date > a.last_reconciled_at::date
    )
  ) as is_estimated
from accounts a
left join transactions t on t.account_id = a.id
group by a.id, a.user_id, a.initial_balance_cents, a.last_reconciled_at;

/*
 * Os dois lados de uma transferência, atômicos (§5.3).
 *
 * SECURITY INVOKER — o padrão — para que a RLS do chamador continue valendo.
 * Uma função SECURITY DEFINER aqui seria um buraco: permitiria mover
 * dinheiro entre contas de outro usuário.
 */
create or replace function create_transfer(
  p_user_id         uuid,
  p_from_account    uuid,
  p_to_account      uuid,
  p_amount_cents    bigint,
  p_description     text,
  p_competence_date date,
  p_settled_date    date,
  p_status          transaction_status,
  p_notes           text
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

alter table reconciliations enable row level security;
alter table reconciliations force  row level security;
alter table audit_events    enable row level security;
alter table audit_events    force  row level security;

create policy reconciliations_proprio on reconciliations
  using (user_id = app_user_id()) with check (user_id = app_user_id());

create policy audit_events_proprio on audit_events
  using (user_id = app_user_id()) with check (user_id = app_user_id());

grant select on account_balances to money_tree_app;
grant select, insert on reconciliations to money_tree_app;
-- Sem UPDATE e sem DELETE: trilha de auditoria que se edita não é trilha.
grant select, insert on audit_events to money_tree_app;
grant execute on function create_transfer(uuid, uuid, uuid, bigint, text, date, date, transaction_status, text)
  to money_tree_app;

-- Down Migration

drop function if exists create_transfer(uuid, uuid, uuid, bigint, text, date, date, transaction_status, text);
drop view if exists account_balances;
drop table if exists audit_events;
drop table if exists reconciliations;
drop type if exists reconciliation_decision;
