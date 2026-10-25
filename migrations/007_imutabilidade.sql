-- Up Migration

/*
 * Lançamento que já moveu saldo não é reescrito (§5.3). Até aqui só a
 * disciplina do código protegia: o role da aplicação tem UPDATE e nada no
 * banco impedia mudar valor, conta ou data de uma linha liquidada. Com a
 * edição de ocorrências recorrentes, um erro de código reescreveria
 * histórico em silêncio.
 *
 * Em linha liquidada, conciliada ou estornada só podem mudar o estado, a
 * data de liquidação junto com o estado, e updated_at. A comparação é do
 * JSON da linha inteira, então coluna acrescentada depois já nasce
 * protegida.
 */
create or replace function transactions_imutavel_apos_liquidar() returns trigger
language plpgsql as $$
declare
  -- signed_amount_cents é coluna gerada: em gatilho BEFORE ela ainda vem
  -- nula em NEW. Sai da comparação sem perder proteção, porque deriva de
  -- amount_cents e direction, que continuam travados.
  v_livres constant text[] := array['status', 'settled_date', 'updated_at', 'signed_amount_cents'];
begin
  if old.status not in ('liquidado', 'conciliado', 'estornado') then
    return new;
  end if;

  if (to_jsonb(new) - v_livres) is distinct from (to_jsonb(old) - v_livres)
     or (new.settled_date is distinct from old.settled_date and new.status = old.status) then
    raise exception
      'Lançamento % está "%" e não pode ser alterado. Use estorno para corrigir.',
      old.id, old.status
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

create trigger transactions_imutavel_apos_liquidar
  before update on transactions
  for each row execute function transactions_imutavel_apos_liquidar();

-- Down Migration

drop trigger if exists transactions_imutavel_apos_liquidar on transactions;
drop function if exists transactions_imutavel_apos_liquidar();
