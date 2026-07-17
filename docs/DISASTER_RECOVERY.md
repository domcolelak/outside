# Backup and disaster recovery

OUTSIDE does not implement database backups itself. The operator must provide encrypted PostgreSQL backups, point-in-time recovery, off-account copies, retention locks where required, and restore monitoring.

## Required practice

- Define business-approved RPO and RTO; do not infer them from this repository.
- Back up before every migration and test a full restore at least quarterly.
- Keep application secrets in a recoverable secret manager with access logging and dual control. Database backups alone cannot decrypt Guardian or Enterprise integration credentials.
- Store deployment manifests, DNS/TLS configuration, cron configuration, OTLP settings, and the exact application image alongside recovery instructions.

## Restore drill

1. Restore to an isolated account/network and block outbound integrations.
2. Deploy the matching application version and run `prisma migrate status` without applying new migrations.
3. Verify row counts, tenant boundaries, evidence snapshot hashes, Enterprise audit chains, and Stripe subscription reconciliation.
4. Expire abandoned leases and allow workers to reclaim them normally. Verify no duplicate notification or ticket delivery before enabling egress.
5. Exercise authentication, a demo scan, one authorized historical read, report generation, and `/api/readyz`.
6. Record achieved RPO/RTO and remediate deviations.

