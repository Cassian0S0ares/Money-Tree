-- Up Migration

/*
 * Metas (spec da fatia 4, seção 4). A meta guarda o plano; o dinheiro
 * reservado não é campo editável, é a soma dos movimentos em
 * `goal_allocations` (spec 3.2), como o saldo é a soma do razão.
 */
create type goal_kind as enum (
  'reserva_emergencia', 'viagem', 'compra', 'quitacao_divida', 'educacao', 'longo_prazo', 'livre'
);
create type goal_priority   as enum ('alta', 'media', 'baixa');
-- `liberacao` é o movimento que zera a reserva ao concluir ou arquivar.
create type allocation_kind as enum ('aporte', 'resgate', 'liberacao');

create table goals (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references users (id) on delete cascade,
  name                        text not null,
  kind                        goal_kind not null,
  target_cents                bigint not null,
  target_date                 date,
  priority                    goal_priority not null default 'media',
  -- Conta padrão dos aportes; o aporte em si pode ir para outra.
  account_id                  uuid,
  -- Contribuição planejada. É plano, não automação: não reserva nada sozinha.
  monthly_contribution_cents  bigint,
  completed_at                timestamptz,
  archived_at                 timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  constraint goals_id_user_unico unique (id, user_id),
  -- Referência só para dado do mesmo usuário (T20), como nas migrações 008 a 010.
  constraint goals_conta_do_mesmo_usuario
    foreign key (account_id, user_id) references accounts (id, user_id) on delete restrict,
  constraint goals_nome_tamanho check (length(btrim(name)) > 0 and length(name) <= 80),
  constraint goals_alvo_positivo check (target_cents > 0),
  constraint goals_contribuicao_positiva
    check (monthly_contribution_cents is null or monthly_contribution_cents > 0)
);

create index goals_user_ativas on goals (user_id) where completed_at is null and archived_at is null;

/*
 * Movimentos de reserva. Só inserção: corrigir é registrar o movimento
 * oposto, e o histórico nunca muda (spec 3.2, T-imutabilidade da 007).
 */
create table goal_allocations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users (id) on delete cascade,
  goal_id       uuid not null,
  account_id    uuid not null,
  kind          allocation_kind not null,
  amount_cents  bigint not null,
  occurred_on   date not null,
  created_at    timestamptz not null default now(),

  constraint goal_allocations_meta_do_mesmo_usuario
    foreign key (goal_id, user_id) references goals (id, user_id) on delete restrict,
  constraint goal_allocations_conta_do_mesmo_usuario
    foreign key (account_id, user_id) references accounts (id, user_id) on delete restrict,
  -- O sinal diz o efeito na reserva; zero não é movimento.
  constraint goal_allocations_sinal_coerente check (
    (kind = 'aporte' and amount_cents > 0)
    or
    (kind in ('resgate', 'liberacao') and amount_cents < 0)
  )
);

create index goal_allocations_meta_conta on goal_allocations (goal_id, account_id);
create index goal_allocations_conta on goal_allocations (account_id);

/*
 * Limites da reserva (spec 3.3 e 4.2). No banco, e não só na tela, porque
 * dependem de outras linhas e precisam valer com duas abas abertas.
 *
 * Travas, nesta ordem:
 * 1. a meta, FOR SHARE: espera quem estiver concluindo ou arquivando a meta
 *    (UPDATE em goals) e depois enxerga `completed_at`/`archived_at` já
 *    gravados. Vem antes da conta para que "atualiza a meta, depois insere
 *    a liberação" numa transação e um aporte noutra peguem as travas na
 *    mesma ordem, sem impasse.
 * 2. a conta, FOR UPDATE: serializa os aportes da mesma conta. Em READ
 *    COMMITTED cada comando da função tem fotografia nova, então as somas
 *    abaixo já veem o aporte que a outra transação acabou de gravar.
 *
 * SECURITY INVOKER, o padrão: a RLS do chamador continua valendo nas
 * leituras, e as FKs compostas recusam conta ou meta de outro usuário.
 */
create or replace function goal_allocations_valida() returns trigger
language plpgsql as $$
declare
  v_meta            goals%rowtype;
  v_conta_arquivada boolean;
  v_reserva_meta    bigint;
  v_saldo           bigint;
  v_reservas        bigint;
begin
  select * into v_meta from goals
   where id = new.goal_id and user_id = new.user_id
   for share;
  if not found then
    -- Meta inexistente ou de outro usuário: a FK composta recusa.
    return new;
  end if;

  select is_archived into v_conta_arquivada from accounts
   where id = new.account_id and user_id = new.user_id
   for update;
  if not found then
    return new;
  end if;

  if new.kind = 'aporte' then
    if v_meta.completed_at is not null or v_meta.archived_at is not null then
      raise exception 'Meta encerrada (concluída ou arquivada) não recebe aporte'
        using errcode = 'check_violation';
    end if;
    if v_conta_arquivada then
      raise exception 'Conta arquivada não recebe aporte'
        using errcode = 'check_violation';
    end if;
  end if;

  -- Resgate e liberação não passam do que a meta tem naquela conta.
  select coalesce(sum(amount_cents), 0) into v_reserva_meta
    from goal_allocations
   where goal_id = new.goal_id and account_id = new.account_id;

  if v_reserva_meta + new.amount_cents < 0 then
    raise exception 'Movimento maior que o reservado nesta conta para a meta'
      using errcode = 'check_violation';
  end if;

  if new.kind = 'aporte' then
    -- O mesmo saldo da tela de contas: a view da 004/005.
    select balance_cents into v_saldo
      from account_balances
     where account_id = new.account_id;

    -- Reservas ativas: só metas que ainda não foram concluídas nem arquivadas.
    select coalesce(sum(a.amount_cents), 0) into v_reservas
      from goal_allocations a
      join goals g on g.id = a.goal_id
     where a.account_id = new.account_id
       and g.completed_at is null
       and g.archived_at is null;

    if new.amount_cents > v_saldo - v_reservas then
      raise exception 'Aporte maior que o saldo sem reserva da conta'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger goal_allocations_valida
  before insert on goal_allocations
  for each row execute function goal_allocations_valida();

alter table goals            enable row level security;
alter table goals            force  row level security;
alter table goal_allocations enable row level security;
alter table goal_allocations force  row level security;

create policy goals_proprio on goals
  using (user_id = app_user_id()) with check (user_id = app_user_id());
create policy goal_allocations_proprio on goal_allocations
  using (user_id = app_user_id()) with check (user_id = app_user_id());

-- Sem DELETE em goals: encerrar é concluir ou arquivar.
grant select, insert, update on goals to money_tree_app;
-- Sem UPDATE nem DELETE: movimento de reserva que se edita não é histórico.
grant select, insert on goal_allocations to money_tree_app;

-- Down Migration

drop table if exists goal_allocations;
drop function if exists goal_allocations_valida();
drop table if exists goals;
drop type if exists allocation_kind;
drop type if exists goal_priority;
drop type if exists goal_kind;
