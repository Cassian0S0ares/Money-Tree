-- Up Migration

-- O role da aplicação. Sem BYPASSRLS, sem CREATEDB, sem SUPERUSER.
-- A senha é definida fora da migração, no painel do provedor, para não
-- entrar no repositório.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'money_tree_app') then
    create role money_tree_app login;
  end if;
end
$$;

grant usage on schema public to money_tree_app;

-- Lê o usuário da sessão. `true` no segundo argumento faz devolver NULL em
-- vez de erro quando a variável não foi definida: conexão sem SET LOCAL
-- simplesmente não enxerga nada, em vez de explodir.
create or replace function app_user_id() returns uuid
language sql stable
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create table users (
  id               uuid primary key default gen_random_uuid(),
  email            text not null,
  password_hash    text not null,
  display_name     text not null,
  locale           text not null default 'pt-BR',
  timezone         text not null default 'America/Sao_Paulo',
  currency         char(3) not null default 'BRL',
  month_start_day  smallint not null default 1,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint users_month_start_day_valido check (month_start_day between 1 and 31),
  -- A v1 opera só em BRL. O §5.2 proíbe habilitar outra moeda antes de
  -- definir cotação, instante de conversão, arredondamento e ganho cambial.
  constraint users_currency_brl check (currency = 'BRL')
);

create unique index users_email_unico on users (lower(email));

create table sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users (id) on delete cascade,
  token_hash       text not null,
  expires_at       timestamptz not null,
  last_seen_at     timestamptz not null default now(),
  revoked_at       timestamptz,
  user_agent_hash  text,
  ip_hash          text,
  created_at       timestamptz not null default now()
);

create unique index sessions_token_hash_unico on sessions (token_hash);
create index sessions_user_id on sessions (user_id);

-- RLS. FORCE porque o dono da tabela ignoraria a policy sem ele.
alter table users    enable row level security;
alter table users    force  row level security;
alter table sessions enable row level security;
alter table sessions force  row level security;

create policy users_proprio on users
  using (id = app_user_id())
  with check (id = app_user_id());

create policy sessions_proprio on sessions
  using (user_id = app_user_id())
  with check (user_id = app_user_id());

grant select, insert, update on users to money_tree_app;
grant select, insert, update, delete on sessions to money_tree_app;

-- Down Migration

drop table if exists sessions;
drop table if exists users;
drop function if exists app_user_id();
