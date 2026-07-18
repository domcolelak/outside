#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "usage: restore.sh <encrypted-backup> <clean-target-database-url>" >&2
  exit 64
fi
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required}"
case "${BACKUP_ENCRYPTION_KEY}" in
  AGE-SECRET-KEY-1*) ;;
  *) echo "BACKUP_ENCRYPTION_KEY must be a native age X25519 identity" >&2; exit 1 ;;
esac
backup="$1"
target="$2"
test -f "${backup}"

temporary="$(mktemp /tmp/outside-restore.XXXXXX.dump)"
identity="$(mktemp /tmp/outside-restore-identity.XXXXXX)"
trap 'rm -f "${temporary}" "${identity}"' EXIT
chmod 0600 "${identity}"
printf '%s\n' "${BACKUP_ENCRYPTION_KEY}" > "${identity}"
age --decrypt --identity="${identity}" --output="${temporary}" "${backup}"
pg_restore --list "${temporary}" >/dev/null
pg_restore --dbname="${target}" --no-owner --exit-on-error "${temporary}"
psql "${target}" -v ON_ERROR_STOP=1 -Atc \
  'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;'
