#!/usr/bin/env bash
# Backup cifrado do banco. A chave nunca entra no repositório.
#
# Uso:  MT_BACKUP_PASSPHRASE='...' ./scripts/backup.sh
# Saída: backups/money-tree-AAAA-MM-DDTHHMMSS.sql.gz.gpg (ignorado pelo Git)
#
# Exige pg_dump da mesma versão principal do servidor (17) e gpg.

set -euo pipefail

: "${MIGRATION_DATABASE_URL:?defina MIGRATION_DATABASE_URL}"
: "${MT_BACKUP_PASSPHRASE:?defina MT_BACKUP_PASSPHRASE}"

for comando in pg_dump gpg gzip; do
  command -v "$comando" >/dev/null || { echo "Falta '$comando' no PATH." >&2; exit 1; }
done

destino="backups"
mkdir -p "$destino"
arquivo="$destino/money-tree-$(date -u +%Y-%m-%dT%H%M%S).sql.gz.gpg"

# Só o schema public: os schemas internos do Supabase (auth, storage…) não
# são do Money Tree e não restauram fora dele.
#
# gpg --symmetric com AES-256 e proteção de integridade: um arquivo
# adulterado falha na decifragem em vez de restaurar dado errado (§11).
# openssl enc não serve: não aceita modo autenticado. A frase vai pelo
# descritor 3, para não aparecer na lista de processos.
pg_dump --no-owner --no-privileges --schema=public "$MIGRATION_DATABASE_URL" \
  | gzip -9 \
  | gpg --batch --yes --symmetric --cipher-algo AES256 --force-mdc \
      --s2k-mode 3 --s2k-digest-algo SHA512 --s2k-count 65011712 \
      --pinentry-mode loopback --passphrase-fd 3 \
      --output "$arquivo" 3<<<"$MT_BACKUP_PASSPHRASE"

echo "Backup criado: $arquivo"
echo "Tamanho: $(du -h "$arquivo" | cut -f1)"
echo
echo "AVISO: sem a frase secreta este arquivo é irrecuperável."
echo "Guarde a frase em gerenciador de senhas, nunca no repositório."
