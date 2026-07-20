# Production deployment

## Required baseline

- Node.js 20.20 or a later supported Node 20 release.
- PostgreSQL 16 with TLS, automated backups, connection pooling, and a dedicated least-privilege application role.
- `OUTSIDE_STORAGE_MODE=database`, `DATABASE_URL`, `AUTH_SECRET`, `OUTSIDE_VERIFY_SECRET`, and `CRON_SECRET`.
- `APP_URL` set to the canonical HTTPS origin. Terminate TLS at a trusted proxy that removes caller-supplied forwarding headers.
- `GUARDIAN_ENCRYPTION_KEY` when Guardian destinations are enabled and `ENTERPRISE_ENCRYPTION_KEY` plus `ENTERPRISE_PROVISIONING_TOKEN` when Enterprise is enabled.

Production refuses memory persistence without an escape hatch.

## Immutable container deployment

`Dockerfile` has two explicit release targets. The default `runner` is a minimal non-root Next.js standalone image. `migrator` contains the pinned Prisma CLI and migrations for a one-shot release task. Build once, record the image digest, inject secrets only at runtime, and run:

```bash
docker build --target migrator -t outside-migrator .
docker run --rm --env DATABASE_URL outside-migrator migrate deploy
docker build -t outside .
docker run --read-only --tmpfs /tmp --env-file .env.production -p 3000:3000 outside
```

Do not put production secrets in build arguments or image layers. The runner uses an unprivileged UID, exposes only port 3000, and has a liveness healthcheck. The CI container gate runs migrations, checks readiness, and completes a deterministic demo scan against PostgreSQL.

For a complete production-like staging topology, use [`ops/staging/README.md`](../ops/staging/README.md). The supplied stack adds HTTPS, a separate scheduler, OTLP collection, Prometheus/Alertmanager/Grafana, database/host/container exporters and encrypted logical backup. Its internal-CA mode is for isolated drills only; the public override requires a trusted certificate.

## Release procedure

1. Back up the database and record the deployed commit and migration name.
2. Run `npm ci`, `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` in an immutable build environment.
3. Run `npm audit --omit=dev --audit-level=high` and review all lockfile changes.
4. Apply `npm run db:migrate` from one release task before application instances start. Never run `prisma db push` in production.
5. Start the new version, verify `/api/livez`, then `/api/readyz`, then a non-persisted demo scan.
6. Enable traffic gradually and watch error rate, provider latency, connection use, queue age, and cron outcomes.

The release-candidate workflow accepts a CI run URL only when the GitHub API confirms that the `CI` workflow completed successfully for the exact release commit. It produces checksummed application/migrator archives, a versioned Terraform provider and a release manifest. The production-like launch workflow then deploys that source state and stores measured operational evidence.

Release migrations are transaction-safe and idempotent where PostgreSQL permits it. Large production indexes must be created in a separately reviewed online-maintenance change; Prisma migration files must not contain `CREATE INDEX CONCURRENTLY` because Prisma executes them transactionally. If a migration fails, stop the rollout and use `prisma migrate resolve` only after an operator has confirmed the exact database state.

## Scheduled work

Call authenticated cron routes with `Authorization: Bearer <CRON_SECRET>`:

- `/api/cron/scan` every 5–15 minutes;
- `/api/cron/agency` after scanning;
- `/api/cron/enterprise` repeatedly until `nextCursor` is null for large fleets;
- `/api/cron/retention` daily;
- `/api/cron/kev-sync` daily (refreshes the CISA Known Exploited Vulnerabilities catalogue).

Cron work is leased and idempotent, but the scheduler must alert on missed invocations and non-2xx responses. Horizontal application scaling does not replace the scheduler.

Set `OUTSIDE_EMAIL_IMMEDIATE_DELIVERY=false` only when the scheduled outbox worker is the exclusive delivery owner. API requests still enqueue transactionally; this mode removes external email-provider latency from request paths and requires strict alerting on outbox age and failed deliveries.

## Observability and data

Configure the OTLP metrics endpoint and alert on readiness, scan failure ratio, p95 provider duration, Guardian oldest-ready age, delivery failures, cron staleness, database saturation, and retention saturation. Logs are structured JSON and must be access controlled because operational identifiers can still be customer metadata.

Set backup retention, point-in-time recovery, and regional placement at the database/platform layer. `OUTSIDE_DATA_REGION` prevents metadata relabeling; it does not move data between regions.

Initial non-contractual objectives and measurement rules are in `SLOS.md`. Do not convert ephemeral CI measurements into customer guarantees.
