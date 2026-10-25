-- Up Migration

/*
 * Referência só para dado do mesmo usuário (ameaça T20).
 *
 * A checagem de chave estrangeira roda como dono da tabela e não passa pela
 * RLS. Com `account_id references accounts (id)`, um usuário que soubesse o
 * id de uma conta alheia conseguia gravar lançamento, conciliação ou
 * subcategoria apontando para ela. A vítima não via as linhas (a RLS filtra
 * por dono), mas a integridade estava quebrada.
 *
 * A troca é por chaves compostas `(coluna, user_id)`: a linha referenciada
 * precisa existir com o mesmo dono. MATCH SIMPLE (o padrão) deixa as colunas
 * opcionais continuarem opcionais.
 */

alter table accounts     add constraint accounts_id_user_unico     unique (id, user_id);
alter table categories   add constraint categories_id_user_unico   unique (id, user_id);
alter table transactions add constraint transactions_id_user_unico unique (id, user_id);

alter table categories drop constraint categories_parent_id_fkey;
alter table categories add constraint categories_pai_do_mesmo_usuario
  foreign key (parent_id, user_id) references categories (id, user_id) on delete restrict;

alter table transactions drop constraint transactions_account_id_fkey;
alter table transactions add constraint transactions_conta_do_mesmo_usuario
  foreign key (account_id, user_id) references accounts (id, user_id) on delete restrict;

alter table transactions drop constraint transactions_category_id_fkey;
alter table transactions add constraint transactions_categoria_do_mesmo_usuario
  foreign key (category_id, user_id) references categories (id, user_id) on delete restrict;

alter table ledger_reversals drop constraint ledger_reversals_original_transaction_id_fkey;
alter table ledger_reversals add constraint ledger_reversals_original_do_mesmo_usuario
  foreign key (original_transaction_id, user_id) references transactions (id, user_id) on delete restrict;

alter table ledger_reversals drop constraint ledger_reversals_reversal_transaction_id_fkey;
alter table ledger_reversals add constraint ledger_reversals_estorno_do_mesmo_usuario
  foreign key (reversal_transaction_id, user_id) references transactions (id, user_id) on delete restrict;

alter table reconciliations drop constraint reconciliations_account_id_fkey;
alter table reconciliations add constraint reconciliations_conta_do_mesmo_usuario
  foreign key (account_id, user_id) references accounts (id, user_id) on delete restrict;

alter table reconciliations drop constraint reconciliations_adjustment_transaction_id_fkey;
alter table reconciliations add constraint reconciliations_ajuste_do_mesmo_usuario
  foreign key (adjustment_transaction_id, user_id) references transactions (id, user_id) on delete restrict;

-- Down Migration

alter table reconciliations drop constraint reconciliations_ajuste_do_mesmo_usuario;
alter table reconciliations add constraint reconciliations_adjustment_transaction_id_fkey
  foreign key (adjustment_transaction_id) references transactions (id) on delete restrict;
alter table reconciliations drop constraint reconciliations_conta_do_mesmo_usuario;
alter table reconciliations add constraint reconciliations_account_id_fkey
  foreign key (account_id) references accounts (id) on delete restrict;
alter table ledger_reversals drop constraint ledger_reversals_estorno_do_mesmo_usuario;
alter table ledger_reversals add constraint ledger_reversals_reversal_transaction_id_fkey
  foreign key (reversal_transaction_id) references transactions (id) on delete restrict;
alter table ledger_reversals drop constraint ledger_reversals_original_do_mesmo_usuario;
alter table ledger_reversals add constraint ledger_reversals_original_transaction_id_fkey
  foreign key (original_transaction_id) references transactions (id) on delete restrict;
alter table transactions drop constraint transactions_categoria_do_mesmo_usuario;
alter table transactions add constraint transactions_category_id_fkey
  foreign key (category_id) references categories (id) on delete restrict;
alter table transactions drop constraint transactions_conta_do_mesmo_usuario;
alter table transactions add constraint transactions_account_id_fkey
  foreign key (account_id) references accounts (id) on delete restrict;
alter table categories drop constraint categories_pai_do_mesmo_usuario;
alter table categories add constraint categories_parent_id_fkey
  foreign key (parent_id) references categories (id) on delete restrict;
alter table transactions drop constraint transactions_id_user_unico;
alter table categories   drop constraint categories_id_user_unico;
alter table accounts     drop constraint accounts_id_user_unico;
