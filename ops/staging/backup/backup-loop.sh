#!/bin/sh
set -eu
interval="${BACKUP_INTERVAL_SECONDS:-86400}"
case "${interval}" in *[!0-9]*|"") echo "BACKUP_INTERVAL_SECONDS must be an integer" >&2; exit 1;; esac
metric_prefix="${BACKUP_METRIC_PREFIX:-outside_backup}"
case "${metric_prefix}" in *[!a-z0-9_]*|"") echo "BACKUP_METRIC_PREFIX must contain only lowercase letters, numbers, and underscores" >&2; exit 1;; esac
if [ "${interval}" -lt 300 ]; then
  echo "BACKUP_INTERVAL_SECONDS must be at least 300" >&2
  exit 1
fi

while true; do
  if ! /opt/outside/backup.sh; then
    now="$(date +%s)"
    metrics_directory="${BACKUP_METRICS_DIRECTORY:-/metrics}"
    cat > "${metrics_directory}/${metric_prefix}_failure.prom.tmp" <<EOF
# HELP ${metric_prefix}_last_failure_unixtime Last failed encrypted logical backup.
# TYPE ${metric_prefix}_last_failure_unixtime gauge
${metric_prefix}_last_failure_unixtime ${now}
EOF
    mv "${metrics_directory}/${metric_prefix}_failure.prom.tmp" "${metrics_directory}/${metric_prefix}_failure.prom"
    printf '{"timestamp":"%s","level":"error","event":"backup.failed","database":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${BACKUP_FILE_PREFIX:-outside}" >&2
  fi
  sleep "${interval}" &
  wait $!
done
