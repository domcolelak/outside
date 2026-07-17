#!/bin/sh
set -eu
interval="${BACKUP_INTERVAL_SECONDS:-86400}"
case "${interval}" in *[!0-9]*|"") echo "BACKUP_INTERVAL_SECONDS must be an integer" >&2; exit 1;; esac
if [ "${interval}" -lt 300 ]; then
  echo "BACKUP_INTERVAL_SECONDS must be at least 300" >&2
  exit 1
fi

while true; do
  if ! /opt/outside/backup.sh; then
    now="$(date +%s)"
    cat > "${BACKUP_METRICS_DIRECTORY:-/metrics}/outside_backup.prom.tmp" <<EOF
# HELP outside_backup_last_failure_unixtime Last failed encrypted logical backup.
# TYPE outside_backup_last_failure_unixtime gauge
outside_backup_last_failure_unixtime ${now}
EOF
    mv "${BACKUP_METRICS_DIRECTORY:-/metrics}/outside_backup.prom.tmp" "${BACKUP_METRICS_DIRECTORY:-/metrics}/outside_backup.prom"
    printf '{"timestamp":"%s","level":"error","event":"backup.failed"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >&2
  fi
  sleep "${interval}" &
  wait $!
done
