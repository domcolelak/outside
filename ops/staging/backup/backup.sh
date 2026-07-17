#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required}"
backup_dir="${BACKUP_DIRECTORY:-/backups}"
metrics_dir="${BACKUP_METRICS_DIRECTORY:-/metrics}"
retention_days="${BACKUP_RETENTION_DAYS:-14}"
case "${retention_days}" in *[!0-9]*|"") echo "BACKUP_RETENTION_DAYS must be an integer" >&2; exit 1;; esac

mkdir -p "${backup_dir}" "${metrics_dir}"
started="$(date +%s)"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
temporary="${backup_dir}/outside-${timestamp}.dump"
encrypted="${temporary}.age"
trap 'rm -f "${temporary}" "${encrypted}.tmp"' EXIT

pg_dump "${DATABASE_URL}" --format=custom --no-owner --file="${temporary}"
AGE_PASSPHRASE="${BACKUP_ENCRYPTION_KEY}" age --passphrase --output="${encrypted}.tmp" "${temporary}"
mv "${encrypted}.tmp" "${encrypted}"
pg_restore --list "${temporary}" >/dev/null
rm -f "${temporary}"

duration="$(( $(date +%s) - started ))"
bytes="$(wc -c < "${encrypted}" | tr -d ' ')"
cat > "${metrics_dir}/outside_backup.prom.tmp" <<EOF
# HELP outside_backup_last_success_unixtime Last successful encrypted logical backup.
# TYPE outside_backup_last_success_unixtime gauge
outside_backup_last_success_unixtime $(date +%s)
# HELP outside_backup_duration_seconds Last encrypted logical backup duration.
# TYPE outside_backup_duration_seconds gauge
outside_backup_duration_seconds ${duration}
# HELP outside_backup_size_bytes Last encrypted logical backup size.
# TYPE outside_backup_size_bytes gauge
outside_backup_size_bytes ${bytes}
EOF
mv "${metrics_dir}/outside_backup.prom.tmp" "${metrics_dir}/outside_backup.prom"
find "${backup_dir}" -type f -name 'outside-*.dump.age' -mtime "+${retention_days}" -delete
printf '{"timestamp":"%s","level":"info","event":"backup.succeeded","file":"%s","durationSeconds":%s,"bytes":%s}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(basename "${encrypted}")" "${duration}" "${bytes}"
printf '%s\n' "${encrypted}"
