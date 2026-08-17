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
  if deleted_sessions="$(psql "${DATABASE_URL}" --no-psqlrc --quiet --set=ON_ERROR_STOP=1 --set="retention_days=${retention_days}" --tuples-only --no-align <<'SQL'
BEGIN;
CREATE TEMP TABLE outside_expired_session ON COMMIT DROP AS
  SELECT session_id
  FROM "session"
  WHERE created_at < NOW() - make_interval(days => :retention_days);
CREATE UNIQUE INDEX ON outside_expired_session (session_id);

CREATE TEMP TABLE outside_expired_visit ON COMMIT DROP AS
  SELECT DISTINCT visit_id FROM website_event WHERE session_id IN (SELECT session_id FROM outside_expired_session)
  UNION
  SELECT DISTINCT visit_id FROM session_replay WHERE session_id IN (SELECT session_id FROM outside_expired_session)
  UNION
  SELECT DISTINCT visit_id FROM heatmap_event WHERE session_id IN (SELECT session_id FROM outside_expired_session);
CREATE UNIQUE INDEX ON outside_expired_visit (visit_id);

DELETE FROM event_data
USING website_event, outside_expired_session
WHERE event_data.website_event_id = website_event.event_id
  AND website_event.session_id = outside_expired_session.session_id;
DELETE FROM revenue USING outside_expired_session WHERE revenue.session_id = outside_expired_session.session_id;
DELETE FROM session_data USING outside_expired_session WHERE session_data.session_id = outside_expired_session.session_id;
DELETE FROM session_replay_saved USING outside_expired_visit WHERE session_replay_saved.visit_id = outside_expired_visit.visit_id;
DELETE FROM session_replay USING outside_expired_session WHERE session_replay.session_id = outside_expired_session.session_id;
DELETE FROM heatmap_event USING outside_expired_session WHERE heatmap_event.session_id = outside_expired_session.session_id;
DELETE FROM website_event USING outside_expired_session WHERE website_event.session_id = outside_expired_session.session_id;
SELECT count(*) FROM outside_expired_session;
DELETE FROM "session" USING outside_expired_session WHERE "session".session_id = outside_expired_session.session_id;
COMMIT;
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
