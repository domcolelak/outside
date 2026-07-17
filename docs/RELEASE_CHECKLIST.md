# Production release checklist

## Change preparation

- [ ] Scope, public API compatibility, migration behavior, and rollback are reviewed.
- [ ] New secrets and environment variables exist in the production secret manager.
- [ ] Database backup completed; restore point, deployed commit, and migration head recorded.
- [ ] Dependency and licence changes have an owner and commercial-use review.

## Required gates

Run from a clean checkout with the pinned npm version and production-like configuration:

```bash
npm ci
npm test
npm run lint
npm run typecheck
npm run db:validate
npm run audit:licenses
npm run audit:secrets
npm audit --omit=dev --audit-level=high
npm run build
```

In CI, require the PostgreSQL migration/E2E job and Terraform provider job. Confirm a clean database reaches the expected migration head. For a release that changes existing data, also restore a representative pre-release backup into staging and apply the migrations there.

## Deployment

- [ ] Apply migrations once from a controlled release task; never run `prisma db push`.
- [ ] Start the application with production validation enabled.
- [ ] Verify `/api/livez` then `/api/readyz`.
- [ ] Confirm cron authentication and one non-persisted demo scan.
- [ ] Gradually enable traffic while watching readiness, error rate, DB pool/locks, provider latency, queue age, delivery outcomes, and billing webhooks.
- [ ] Confirm synthetic demo mode remains isolated from customer scans.

## Rollback decision

Roll back application traffic when error/SLO thresholds or a security boundary fail. Do not automatically reverse a data migration. Keep the new schema compatible with the prior application where possible; otherwise roll forward with a reviewed corrective migration. Follow [DEPLOYMENT.md](DEPLOYMENT.md) and [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md).

## Release evidence

Attach CI URLs, exact commit/image digest, migration head, validation output, dependency audit, approver, deployment timestamps, smoke-test results, and any accepted non-blocking risk to the release record.

