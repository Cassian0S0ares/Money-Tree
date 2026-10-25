-- Up Migration

/*
 * Orçamentos (spec da fatia 3, seção 4). Um orçamento por categoria-raiz
 * de despesa; o limite é datado em `budget_limits`, para mudar daqui em
 * diante sem reescrever os meses passados.
 */
create table budgets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users (id) on delete cascade,
  category_id     uuid not null,
  rollover        boolean not null default false,
  rollover_since  date,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint budgets_id_user_unico unique (id, user_id),
  -- Referência só para dado do mesmo usuário (T20), como nas migrações 008 e 009.
  constraint budgets_categoria_do_mesmo_usuario
    foreign key (category_id, user_id) references categories (id, user_id) on delete restrict,
  constraint budgets_acumulacao_coerente check (not rollover or rollover_since is not null)
);

create unique index budgets_um_ativo_por_categoria
  on budgets (user_id, category_id) where archived_at is null;

/*
 * Orçamento só em categoria-raiz de despesa (spec 3.3). Em subcategoria, o
 * mesmo gasto contaria na raiz e na filha: a dupla contagem que o §6.2
 * proíbe. Gatilho porque a regra depende de outra linha.
 */
create or replace function budgets_categoria_valida() returns trigger
language plpgsql as $$
declare
  v_categoria categories%rowtype;
begin
  select * into v_categoria from categories where id = new.category_id;

  if v_categoria.kind <> 'despesa' then
    raise exception 'Orçamento só existe para categoria de despesa'
      using errcode = 'check_violation';
  end if;
  if v_categoria.parent_id is not null then
    raise exception 'Orçamento só existe em categoria-raiz; o gasto das subcategorias soma nela'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger budgets_categoria_valida
  before insert or update of category_id on budgets
  for each row execute function budgets_categoria_valida();

create table budget_limits (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users (id) on delete cascade,
  budget_id     uuid not null,
  -- O limite vale a partir do período que começa nesta data.
  starts_on     date not null,
  amount_cents  bigint not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint budget_limits_orcamento_do_mesmo_usuario
    foreign key (budget_id, user_id) references budgets (id, user_id) on delete restrict,
  -- Zero é válido: "não quero gastar nada com isso".
  constraint budget_limits_nao_negativo check (amount_cents >= 0),
  constraint budget_limits_data_unica unique (budget_id, starts_on)
);

alter table budgets       enable row level security;
alter table budgets       force  row level security;
alter table budget_limits enable row level security;
alter table budget_limits force  row level security;

create policy budgets_proprio on budgets
  using (user_id = app_user_id()) with check (user_id = app_user_id());
create policy budget_limits_proprio on budget_limits
  using (user_id = app_user_id()) with check (user_id = app_user_id());

-- Sem DELETE: remover orçamento é arquivar, e o histórico de limites fica.
grant select, insert, update on budgets to money_tree_app;
grant select, insert, update on budget_limits to money_tree_app;

-- Down Migration

drop table if exists budget_limits;
drop trigger if exists budgets_categoria_valida on budgets;
drop function if exists budgets_categoria_valida();
drop table if exists budgets;
