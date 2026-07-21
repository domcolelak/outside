# Production-like staging

This stack exercises the production application and migration images with PostgreSQL 16, scheduled jobs, HTTPS, OpenTelemetry, Prometheus, Alertmanager, Grafana, host/container metrics, and encrypted logical backups. It is suitable for an isolated staging VM; it is not a claim that a single-VM Compose topology is the recommended high-availability production topology.

## Prerequisites

- A dedicated Linux VM with Docker Engine and Compose v2.
- At least 4 vCPU, 8 GB RAM, and 40 GB durable storage for a small pilot staging environment.
- For public staging: a dedicated hostname whose A/AAAA records point to the VM, ports 80/443 reachable for ACME, and no production credentials or customer data.
- The exact application and migrator images produced by the release-candidate workflow.

Copy `ops/staging/.env.staging.example` to the repository root as `.env.staging`, replace every `CHANGE_ME` value with independent secret-manager values, and restrict the file to the deployment account:

```bash
install -m 0600 ops/staging/.env.staging.example .env.staging
```

Do not commit `.env.staging`. Use test-mode Stripe, a staging-only Resend domain, staging integration destinations, and staging-only encryption keys. Generate the backup identity once, escrow it outside the database and place the single `AGE-SECRET-KEY-1...` line in `BACKUP_ENCRYPTION_KEY`:

```bash
docker run --rm --entrypoint age-keygen outside-staging-backup
```

## Isolated internal-TLS drill

Map `outside.test` to the VM, keep `APP_URL=https://outside.test:8443`, and run:

```bash
docker compose --env-file .env.staging -f ops/staging/compose.yaml config --quiet
docker compose --env-file .env.staging -f ops/staging/compose.yaml up --detach --build
curl --insecure --resolve outside.test:8443:127.0.0.1 https://outside.test:8443/api/readyz
```

The internal CA is deliberately not trusted. It validates TLS termination and headers without representing public certificate issuance.

## Public staging

Set `STAGING_DOMAIN`, `APP_URL=https://<hostname>`, and `HTTPS_PORT=443`, then run:

```bash
docker compose --env-file .env.staging \
  -f ops/staging/compose.yaml \
  -f ops/staging/compose.public.yaml \
  config --quiet
docker compose --env-file .env.staging \
  -f ops/staging/compose.yaml \
  -f ops/staging/compose.public.yaml \
  up --detach --build
curl --fail https://<hostname>/api/readyz
```

The public override requires a trusted certificate and makes blackbox TLS validation strict. Do not continue if Caddy serves an untrusted, expired, or hostname-mismatched certificate.

## Operator access

- Product: `APP_URL`.
- Grafana: `http://127.0.0.1:3001` by default. The loopback-only operator listener is proxied by Caddy to avoid publishing the monitoring container directly; use an SSH tunnel rather than exposing it publicly.
- Prometheus and Alertmanager have no host ports and remain on the internal monitoring network.
- Application, scheduler, exporters, and backup processes run without root. cAdvisor is the explicit exception: it requires privileged host visibility and must only run on a dedicated staging host. Use the infrastructure provider's native container metrics in production.

The default Alertmanager receiver writes bounded, actionable alert summaries to the `alert-sink` container. Before inviting a pilot customer, replace it with an access-controlled on-call destination and send a test alert through the complete path.

## Deployment and update

For an existing single-host staging deploy, `ops/staging/deploy.sh` performs the
app build + recreate with real build provenance (git SHA + build time stamped
into the image and surfaced by `/api/readyz`):

```bash
ops/staging/deploy.sh              # app only, from origin/master
ops/staging/deploy.sh --migrate    # also rebuild + run the migrator
ops/staging/deploy.sh --ref v0.2.0-rc.1
```

For a first bring-up or a controlled release, follow the manual steps below.

1. Record the current commit, image IDs/digests, schema head, and backup restore point.
2. Pull or load the exact release artifacts; never rebuild a tagged release on the host.
3. Set `OUTSIDE_IMAGE` and `OUTSIDE_MIGRATOR_IMAGE` to immutable digests.
4. Run `compose config --quiet`.
5. Run only `migrate`; require successful completion before starting the application.
6. Start the new stack, verify liveness/readiness/release identity, then run customer smoke tests.
7. Observe readiness, 5xx, DB connections, queue age, scheduler outcomes, provider results, and delivery outcomes during a gradual traffic shift.

Application rollback uses the prior immutable image. Do not reverse a data migration automatically. Preserve queue rows, stop outbound delivery if integrity is uncertain, and follow `docs/DISASTER_RECOVERY.md`.

## Backup and restore

The `backup` service immediately creates an encrypted custom-format PostgreSQL dump and then follows `BACKUP_INTERVAL_SECONDS`. Encryption uses a native age X25519 identity; the identity must be escrowed separately from database storage. Losing it makes existing backups unrecoverable.

To create an additional backup:

```bash
docker compose --env-file .env.staging -f ops/staging/compose.yaml \
  run --rm backup /opt/outside/backup.sh
```

Restore only into a clean isolated database:

```bash
docker compose --env-file .env.staging -f ops/staging/compose.yaml \
  run --rm backup /opt/outside/restore.sh \
  /backups/outside-YYYYMMDDTHHMMSSZ.dump.age \
  postgresql://outside:<password>@postgres:5432/outside_restore
```

The logical backup is a staging recovery control and release drill. Paying production still requires managed encrypted backups, point-in-time recovery, off-account copies, retention policy, and provider-level restore evidence.

## Automated evidence

The `Production-like launch validation` workflow performs the isolated deployment, HTTPS browser flows, measured probes, process/DB interruption, leased-work recovery, encrypted backup/clean restore, wrong-key rejection, restored application startup, and failed-deployment readiness rejection. Its artifact contains measured JSON, resource samples, logs, browser diagnostics, container identity, and SHA-256 checksums.

The workflow does not validate real email, Stripe, third-party integrations, authorized public domains, public ACME, managed PITR, regional placement, legal review, independent penetration testing, or sustained real traffic.
