# Backup and disaster recovery

OUTSIDE does not implement database backups itself. The operator must provide encrypted PostgreSQL backups, point-in-time recovery, off-account copies, retention locks where required, and restore monitoring.

## Required practice

- Define business-approved RPO and RTO; do not infer them from this repository.
- Back up before every migration and test a full restore at least quarterly.
- Keep application secrets in a recoverable secret manager with access logging and dual control. Database backups alone cannot decrypt Guardian or Enterprise integration credentials.
- Store deployment manifests, DNS/TLS configuration, cron configuration, OTLP settings, and the exact application image alongside recovery instructions.

CI performs a release-level logical recovery regression on every change: it creates a PostgreSQL custom-format dump after migrations and integration workflows, restores it into a new database with `--exit-on-error`, verifies all migrations are applied, and reads tenant and Guardian evidence tables. This catches schema-level backup incompatibility; it does not replace the operator's managed-backup/PITR exercise or prove a contractual RPO/RTO.

The production-like launch workflow additionally creates an age-encrypted custom-format dump after browser workflows, rejects a wrong passphrase, restores into a clean database, and boots the exact production image against the restored data. The measured durations are retained in its evidence artifact. This remains an ephemeral logical-restore drill, not managed PITR or cross-account recovery.

## Restore drill

1. Restore to an isolated account/network and block outbound integrations.
2. Deploy the matching application version and run `prisma migrate status` without applying new migrations.
3. Verify row counts, tenant boundaries, evidence snapshot hashes, Enterprise audit chains, and Stripe subscription reconciliation.
4. Expire abandoned leases and allow workers to reclaim them normally. Verify no duplicate notification or ticket delivery before enabling egress.
5. Exercise authentication, a demo scan, one authorized historical read, report generation, and `/api/readyz`.
6. Record achieved RPO/RTO and remediate deviations.

## Encryption-key loss

1. Stop outbound Guardian and Enterprise delivery while key validity is uncertain.
2. Restore the current and approved previous keys from the audited secret manager; validate encoding before deployment.
3. If no valid key exists, do not attempt to invent or derive it. Encrypted integration credentials are unrecoverable.
4. Preserve non-secret customer data, identify affected integrations without exposing ciphertext, revoke provider-side credentials, and guide authorized administrators to reconnect.
5. Record which credentials were re-established, test delivery, remove invalid previous keys, and rotate any credential that may have been exposed.
