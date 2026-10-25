-- Up Migration

create type account_type as enum (
  'corrente', 'pagamento', 'poupanca', 'carteira',
  'cartao_credito', 'investimento', 'emprestimo', 'outro'
);

create type category_kind as enum ('receita', 'despesa');

create table accounts (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references users (id) on delete cascade,
  name                    text not null,
  type                    account_type not null,
  institution             text,
  initial_balance_cents   bigint not null default 0,
  initial_balance_date    date not null,
  currency                char(3) not null default 'BRL',

  -- Duas coisas diferentes, de propósito. `is_liquid` descreve o ativo: o
  -- dinheiro pode ser usado hoje. `include_in_available` é escolha do
  -- usuário. O §6.1 soma apenas o que é líquido E incluído.
  is_liquid               boolean not null,
  include_in_available    boolean not null,
  include_in_net_worth    boolean not null default true,

  is_archived             boolean not null default false,
  last_reconciled_at      timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint accounts_currency_brl check (currency = 'BRL'),
  constraint accounts_name_nao_vazio check (length(btrim(name)) > 0)
);

-- Os padrões dependem do tipo, então vêm de gatilho e não de DEFAULT.
-- Limite de cartão não é dinheiro disponível (§5.7), e investimento sem
-- liquidez imediata não entra no saldo disponível (§6.1).
create or replace function accounts_padroes_por_tipo() returns trigger
language plpgsql as $$
begin
  if new.is_liquid is null then
    new.is_liquid := new.type in ('corrente', 'pagamento', 'poupanca', 'carteira');
  end if;
  if new.include_in_available is null then
    new.include_in_available := new.is_liquid;
  end if;
  return new;
end;
$$;

create trigger accounts_padroes
  before insert on accounts
  for each row execute function accounts_padroes_por_tipo();

create index accounts_user_ativas on accounts (user_id) where not is_archived;

create table categories (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users (id) on delete cascade,
  parent_id    uuid references categories (id) on delete restrict,
  name         text not null,
  kind         category_kind not null,
  is_archived  boolean not null default false,
  is_system    boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint categories_name_nao_vazio check (length(btrim(name)) > 0),
  constraint categories_nao_e_propria_pai check (parent_id is distinct from id)
);

create index categories_user_kind on categories (user_id, kind) where not is_archived;
create unique index categories_nome_unico
  on categories (user_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- As catorze do §5.5. Todas editáveis e arquiváveis: `is_system` marca a
-- origem, não impede alteração.
create or replace function seed_categorias_padrao(p_user_id uuid) returns void
language sql as $$
  insert into categories (user_id, name, kind, is_system, sort_order)
  values
    (p_user_id, 'Moradia',                   'despesa', true,  1),
    (p_user_id, 'Supermercado e alimentação','despesa', true,  2),
    (p_user_id, 'Transporte',                'despesa', true,  3),
    (p_user_id, 'Saúde',                     'despesa', true,  4),
    (p_user_id, 'Educação',                  'despesa', true,  5),
    (p_user_id, 'Lazer e entretenimento',    'despesa', true,  6),
    (p_user_id, 'Assinaturas',               'despesa', true,  7),
    (p_user_id, 'Compras pessoais',          'despesa', true,  8),
    (p_user_id, 'Família e dependentes',     'despesa', true,  9),
    (p_user_id, 'Impostos e tarifas',        'despesa', true, 10),
    (p_user_id, 'Dívidas e juros',           'despesa', true, 11),
    (p_user_id, 'Metas e reservas',          'despesa', true, 12),
    (p_user_id, 'Renda',                     'receita', true, 13),
    (p_user_id, 'Outras',                    'despesa', true, 14);
$$;

alter table accounts   enable row level security;
alter table accounts   force  row level security;
alter table categories enable row level security;
alter table categories force  row level security;

create policy accounts_proprio on accounts
  using (user_id = app_user_id()) with check (user_id = app_user_id());

create policy categories_proprio on categories
  using (user_id = app_user_id()) with check (user_id = app_user_id());

grant select, insert, update on accounts to money_tree_app;
grant select, insert, update on categories to money_tree_app;
grant execute on function seed_categorias_padrao(uuid) to money_tree_app;

-- Down Migration

drop function if exists seed_categorias_padrao(uuid);
drop table if exists categories;
drop trigger if exists accounts_padroes on accounts;
drop function if exists accounts_padroes_por_tipo();
drop table if exists accounts;
drop type if exists category_kind;
drop type if exists account_type;
