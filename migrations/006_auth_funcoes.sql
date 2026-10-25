-- Up Migration

/*
 * O caminho anterior ao login.
 *
 * A aplicação conecta como money_tree_app, e a RLS forçada só deixa ver a
 * linha cujo dono é `app.user_id`. Antes do login não existe dono: procurar
 * o usuário pelo e-mail ou a sessão pelo token não enxergaria nada.
 *
 * Em vez de dar BYPASSRLS ao role, três funções SECURITY DEFINER fazem só o
 * que o login precisa, e devolvem o mínimo: id e hash da senha, ou o dono da
 * sessão. Tudo que vem depois — ler o perfil, abrir sessão, semear
 * categorias — já conhece o usuário e passa pela RLS normalmente.
 *
 * `search_path` fixo: sem ele, quem criasse um objeto homônimo num schema
 * anterior do caminho sequestraria a função com os privilégios do dono.
 */

create or replace function auth_buscar_credencial(p_email text)
returns table (id uuid, password_hash text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select u.id, u.password_hash
  from users u
  where lower(u.email) = lower(p_email) and u.is_active
$$;

-- Valida e renova o relógio de ociosidade numa instrução só. Três coisas
-- invalidam: sessão revogada, prazo total vencido, ou tempo demais sem uso.
create or replace function auth_validar_sessao(p_token_hash text, p_ociosidade_minutos integer)
returns uuid
language sql volatile security definer
set search_path = public, pg_temp
as $$
  update sessions s
  set last_seen_at = now()
  from users u
  where s.token_hash = p_token_hash
    and u.id = s.user_id
    and u.is_active
    and s.revoked_at is null
    and s.expires_at > now()
    and s.last_seen_at > now() - make_interval(mins => p_ociosidade_minutos)
  returning s.user_id
$$;

create or replace function auth_encerrar_sessao(p_token_hash text)
returns void
language sql volatile security definer
set search_path = public, pg_temp
as $$
  update sessions set revoked_at = now()
  where token_hash = p_token_hash and revoked_at is null
$$;

-- Funções nascem executáveis por PUBLIC. Aqui, só a aplicação.
revoke execute on function auth_buscar_credencial(text) from public;
revoke execute on function auth_validar_sessao(text, integer) from public;
revoke execute on function auth_encerrar_sessao(text) from public;

grant execute on function auth_buscar_credencial(text) to money_tree_app;
grant execute on function auth_validar_sessao(text, integer) to money_tree_app;
grant execute on function auth_encerrar_sessao(text) to money_tree_app;

-- Down Migration

drop function if exists auth_encerrar_sessao(text);
drop function if exists auth_validar_sessao(text, integer);
drop function if exists auth_buscar_credencial(text);
