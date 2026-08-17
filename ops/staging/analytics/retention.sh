#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
retention_days="${OUTSIDE_ANALYTICS_RETENTION_DAYS:-730}"
interval="${ANALYTICS_RETENTION_INTERVAL_SECONDS:-86400}"
metrics_directory="${ANALYTICS_RETENTION_METRICS_DIRECTORY:-/metrics}"
case "${retention_days}" in *[!0-9]*|"") echo "OUTSIDE_ANALYTICS_RETENTION_DAYS must be an integer" >&2; exit 1;; esac
case "${interval}" in *[!0-9]*|"") echo "ANALYTICS_RETENTION_INTERVAL_SECONDS must be an integer" >&2; exit 1;; esac
if [ "${retention_days}" -lt 30 ] || [ "${retention_days}" -gt 3650 ]; then
  echo "OUTSIDE_ANALYTICS_RETENTION_DAYS must be between 30 and 3650" >&2
  exit 1
fi
if [ "${interval}" -lt 300 ]; then
  echo "ANALYTICS_RETENTION_INTERVAL_SECONDS must be at least 300" >&2
  exit 1
fi
mkdir -p "${metrics_directory}"

while true; do
  now="$(date +%s)"
  if deleted_sessions="$(psql "${DATABASE_URL}" --no-psqlrc --set=ON_ERROR_STOP=1 --set="retention_days=${retention_days}" --tuples-only --no-align <<'SQL'
WITH deleted AS (
  DELETE FROM "session"
  WHERE created_at < NOW() - make_interval(days => :retention_days)
  RETURNING 1
)
SELECT count(*) FROM deleted;
SQL
  )"; then
    deleted_sessions="$(printf '%s' "${deleted_sessions}" | tr -d '[:space:]')"
    case "${deleted_sessions}" in *[!0-9]*|"") deleted_sessions=0;; esac
    cat > "${metrics_directory}/outside_analytics_retention.prom.tmp" <<EOF
# HELP outside_analytics_retention_last_success_unixtime Last successful analytics retention run.
# TYPE outside_analytics_retention_last_success_unixtime gauge
outside_analytics_retention_last_success_unixtime ${now}
# HELP outside_analytics_retention_deleted_sessions Sessions deleted by the last analytics retention run.
# TYPE outside_analytics_retention_deleted_sessions gauge
outside_analytics_retention_deleted_sessions ${deleted_sessions}
EOF
    mv "${metrics_directory}/outside_analytics_retention.prom.tmp" "${metrics_directory}/outside_analytics_retention.prom"
    printf '{"timestamp":"%s","level":"info","event":"analytics.retention.succeeded","retentionDays":%s,"deletedSessions":%s}\n' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${retention_days}" "${deleted_sessions}"
  else
    cat > "${metrics_directory}/outside_analytics_retention_failure.prom.tmp" <<EOF
# HELP outside_analytics_retention_last_failure_unixtime Last failed analytics retention run.
# TYPE outside_analytics_retention_last_failure_unixtime gauge
outside_analytics_retention_last_failure_unixtime ${now}
EOF
    mv "${metrics_directory}/outside_analytics_retention_failure.prom.tmp" "${metrics_directory}/outside_analytics_retention_failure.prom"
    printf '{"timestamp":"%s","level":"error","event":"analytics.retention.failed"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >&2
  fi
  sleep "${interval}" &
  wait $!
done
