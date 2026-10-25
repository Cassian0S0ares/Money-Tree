-- Up Migration

/*
 * Estorno anula exatamente o efeito do original. Na 003/004 o original
 * estornado deixava de contar E a linha oposta entrava liquidada: a correção
 * era aplicada duas vezes. Agora o original continua no saldo — o dinheiro de
 * fato saiu naquela data — e a linha oposta o compensa. Soma zero, e o saldo
 * de qualquer data passada continua verdadeiro.
 *
 * Como `estornado` só nasce de `liquidado` ou `conciliado`, ele sempre tem
 * data de liquidação, e a constraint passa a exigir isso.
 */
alter table transactions drop constraint tx_liquidacao_coerente;

alter table transactions add constraint tx_liquidacao_coerente check (
  (status in ('liquidado', 'conciliado', 'estornado') and settled_date is not null)
  or
  (status in ('previsto', 'pendente', 'cancelado') and settled_date is null)
);

create or replace view account_balances with (security_invoker = true) as
select
  a.id   as account_id,
  a.user_id,
  a.initial_balance_cents
    + coalesce(sum(t.signed_amount_cents) filter (
        where t.status in ('liquidado', 'conciliado', 'estornado')
      ), 0) as balance_cents,
  (
    a.last_reconciled_at is null
    or exists (
      select 1 from transactions posterior
      where posterior.account_id = a.id
        and posterior.status in ('liquidado', 'conciliado', 'estornado')
        and posterior.settled_date > a.last_reconciled_at::date
    )
  ) as is_estimated
from accounts a
left join transactions t on t.account_id = a.id
group by a.id, a.user_id, a.initial_balance_cents, a.last_reconciled_at;

-- Down Migration

create or replace view account_balances with (security_invoker = true) as
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

alter table transactions drop constraint tx_liquidacao_coerente;

alter table transactions add constraint tx_liquidacao_coerente check (
  (status in ('liquidado', 'conciliado') and settled_date is not null)
  or
  (status not in ('liquidado', 'conciliado') and settled_date is null)
);
