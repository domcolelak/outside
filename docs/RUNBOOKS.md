# Operator runbooks

The deployment alert rules live in `ops/staging/observability/alerts.yaml`. Alert labels name a role, not a person; the on-call roster must map every role to a current human owner and escalation contact.

## Service is unready

1. Check `/api/livez`; if it fails, replace the process.
2. Check `/api/readyz`; if it fails, inspect database reachability, credentials, pool exhaustion, locks, and migrations.
3. Do not route traffic to an unready instance. Do not switch production to memory storage.

## Guardian or monitor backlog

1. Confirm the scheduler is invoking cron with the current secret.
2. Inspect oldest queue age, pending/retry counts, lease expiry, and provider latency.
3. Resume normal cron invocations. Leases recover abandoned work after expiry; do not manually duplicate jobs.
4. If provider failure is concentrated, reduce concurrency or disable the affected destination. Do not disable evidence persistence.

## Provider degradation

Treat timeouts and missing observations as incomplete evidence, never as a passing control. Confirm DNS/CT/HTTPS provider status, egress DNS, TLS trust, and timeout metrics. OUTSIDE must continue with explicit provider failure records and must not infer absent assets from a failed source.

## Stripe webhook failures

Verify the signing secret, inspect the event type and idempotency record, correct the root cause, then replay the event from Stripe. Subscription mutation and processed-event recording are transactional in database mode. Never edit plan state without an audit trail and reconciliation.

## Encryption-key rotation

Set the previous-key variable, deploy the new primary key, exercise reads and writes, then re-encrypt stored credentials through an approved migration before removing the previous key. Guardian and Enterprise keys are independent. Loss of all valid keys makes integration credentials unrecoverable.

## Retention saturation

Run the retention endpoint again after the current run finishes. Increase bounded batch settings gradually while monitoring locks, replicas, and latency. Immutable Enterprise audit records are not silently removed; use an approved export/archive policy.

## HTTP error rate or latency

1. Separate edge errors from application 5xx using Caddy metrics and request IDs.
2. Check readiness, database connections/locks, report/scan concurrency and provider latency.
3. Stop a rollout when the increase aligns with the new image. Drain an unhealthy instance before restarting it.
4. Never mask a provider outage by converting missing evidence into a successful security control.

## Scheduler missed or repeatedly failed

1. Confirm exactly one scheduler owner has the current cron secret and can reach the internal application URL.
2. Check the last success per job, response status, pagination cursor, database leases and application logs.
3. Restore normal invocation. Let abandoned leases expire or age them only during a recorded recovery drill.
4. Do not run parallel manual jobs until idempotency keys and lease state are understood.

## Backup missing or failed

1. Check database reachability, backup storage capacity/permissions and the backup service log.
2. Run an additional encrypted logical backup and validate its custom-format manifest.
3. Verify the managed backup/PITR service independently; a successful logical dump does not prove PITR.
4. Assess whether the approved RPO is already breached and escalate. Never overwrite the last known-good copy.

## Resource pressure

For memory, capture container/process diagnostics and current scan/report concurrency before a controlled restart. For disk, identify database, WAL, backup, metrics or log growth and preserve required evidence before cleanup. For CPU, separate expected active scans/report rendering from stuck loops or retry amplification. Increase capacity only after the workload and bound are understood.

## Certificate expiry

Confirm the served certificate and chain from outside the deployment, DNS ownership, ACME status and port reachability. Renew or replace before the alert threshold. Do not disable strict TLS probes or use the internal staging CA for a public environment.

## Alert delivery collapse

Check Prometheus rule evaluation, Alertmanager queue/status, receiver credentials and the operator sink. Send a controlled test alert after repair and record receipt plus resolution. A dashboard-only alert is not an active paging control.

## Security incident

Follow [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md). Preserve audit chains, provider runs, webhook events, access logs, and database snapshots before cleanup.
