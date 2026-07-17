# Operator runbooks

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

## Security incident

Follow [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md). Preserve audit chains, provider runs, webhook events, access logs, and database snapshots before cleanup.

