# Production deployment

## Required baseline

- Node.js 20.20 or a later supported Node 20 release.
- PostgreSQL 16 with TLS, automated backups, connection pooling, and a dedicated least-privilege application role.
- `OUTSIDE_STORAGE_MODE=database`, `DATABASE_URL`, `AUTH_SECRET`, `OUTSIDE_VERIFY_SECRET`, and `CRON_SECRET`.
- `APP_URL` set to the canonical HTTPS origin. Terminate TLS at a trusted proxy that removes caller-supplied forwarding headers.
- `GUARDIAN_ENCRYPTION_KEY` when Guardian destinations are enabled and `ENTERPRISE_ENCRYPTION_KEY` plus `ENTERPRISE_PROVISIONING_TOKEN` when Enterprise is enabled.

Production refuses memory persistence without an escape hatch.

## Release procedure

1. Back up the database and record the deployed commit and migration name.
2. Run `npm ci`, `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` in an immutable build environment.
3. Run `npm audit --omit=dev --audit-level=high` and review all lockfile changes.
4. Apply `npm run db:migrate` from one release task before application instances start. Never run `prisma db push` in production.
5. Start the new version, verify `/api/livez`, then `/api/readyz`, then a non-persisted demo scan.
6. Enable traffic gradually and watch error rate, provider latency, connection use, queue age, and cron outcomes.

Migrations containing `CREATE INDEX CONCURRENTLY` must not be wrapped in an external transaction. If a migration fails, stop the rollout and use `prisma migrate resolve` only after an operator has confirmed the database state.

## Scheduled work

Call authenticated cron routes with `Authorization: Bearer <CRON_SECRET>`:

- `/api/cron/scan` every 5–15 minutes;
- `/api/cron/agency` after scanning;
- `/api/cron/enterprise` repeatedly until `nextCursor` is null for large fleets;
- `/api/cron/retention` daily.

Cron work is leased and idempotent, but the scheduler must alert on missed invocations and non-2xx responses. Horizontal application scaling does not replace the scheduler.

## Observability and data

Configure the OTLP metrics endpoint and alert on readiness, scan failure ratio, p95 provider duration, Guardian oldest-ready age, delivery failures, cron staleness, database saturation, and retention saturation. Logs are structured JSON and must be access controlled because operational identifiers can still be customer metadata.

Set backup retention, point-in-time recovery, and regional placement at the database/platform layer. `OUTSIDE_DATA_REGION` prevents metadata relabeling; it does not move data between regions.
