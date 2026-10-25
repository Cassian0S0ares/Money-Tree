#!/usr/bin/env bash
# Prova que o backup restaura. O §17 trata restauração testada como
# critério de sucesso, não como intenção.
#
# Uso:
#   npx tsx scripts/postgres-descartavel.ts      # noutro terminal
#   MT_BACKUP_PASSPHRASE='...' ./scripts/restore-test.sh backups/arquivo.sql.gz.gpg
#
# Exige psql e gpg. RESTORE_ADMIN_URL aponta para um Postgres descartável;
# nunca para o de produção — o script apaga e recria um banco nele.

set -euo pipefail

arquivo="${1:?informe o arquivo de backup}"
: "${MT_BACKUP_PASSPHRASE:?defina MT_BACKUP_PASSPHRASE}"
url_admin="${RESTORE_ADMIN_URL:-postgresql://postgres:postgres@localhost:55434}"
banco_teste="money_tree_restore_test"

for comando in psql gpg gunzip; do
  command -v "$comando" >/dev/null || { echo "Falta '$comando' no PATH." >&2; exit 1; }
done

case "$url_admin" in
  *localhost*|*127.0.0.1*) ;;
  *) echo "RESTORE_ADMIN_URL precisa ser local; o script apaga um banco nele." >&2; exit 1 ;;
esac

psql "$url_admin/postgres" -qc "drop database if exists $banco_teste;"
psql "$url_admin/postgres" -qc "create database $banco_teste;"

echo "Restaurando…"
gpg --batch --quiet --decrypt --pinentry-mode loopback --passphrase-fd 3 \
    "$arquivo" 3<<<"$MT_BACKUP_PASSPHRASE" \
  | gunzip \
  | psql --quiet --set ON_ERROR_STOP=1 "$url_admin/$banco_teste"

echo "Conferindo…"
psql "$url_admin/$banco_teste" -tAc "
  select
    (select count(*) from users)        as usuarios,
    (select count(*) from accounts)     as contas,
    (select count(*) from transactions) as lancamentos;
"

# A conferência mais importante: o saldo restaurado bate com o original?
psql "$url_admin/$banco_teste" -tAc "
  select a.name, b.balance_cents
  from accounts a join account_balances b on b.account_id = a.id
  order by a.name;
"

echo
echo "Restauração concluída. Compare os saldos acima com os do sistema."
echo "Se conferirem, anote a data em docs/seguranca/backup-e-restauracao.md."
