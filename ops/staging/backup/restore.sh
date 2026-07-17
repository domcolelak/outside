#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "usage: restore.sh <encrypted-backup> <clean-target-database-url>" >&2
  exit 64
fi
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required}"
backup="$1"
target="$2"
test -f "${backup}"

temporary="$(mktemp /tmp/outside-restore.XXXXXX.dump)"
trap 'rm -f "${temporary}"' EXIT
AGE_PASSPHRASE="${BACKUP_ENCRYPTION_KEY}" age --decrypt --output="${temporary}" "${backup}"
pg_restore --list "${temporary}" >/dev/null
pg_restore --dbname="${target}" --no-owner --exit-on-error "${temporary}"
psql "${target}" -v ON_ERROR_STOP=1 -Atc \
  'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;'
