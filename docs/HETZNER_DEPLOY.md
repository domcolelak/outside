# Deploy OUTSIDE to a Hetzner VM (custom domain, trusted HTTPS)

A single-VM production-like deployment: application, PostgreSQL, scheduler,
Prometheus/Grafana/Alertmanager, OpenTelemetry, encrypted backups and Caddy
with automatic Let's Encrypt HTTPS — all from `ops/staging`. Suitable for a
pilot or for demonstrating a working product to a buyer.

## What you provide (account/payment steps)

1. **A Hetzner Cloud server.** `CX22` (2 vCPU / 4 GB) works for a light demo;
   `CX32` (4 vCPU / 8 GB) is recommended and matches the stack's headroom.
   Image: **Ubuntu 24.04**. Region: pick one near your users (e.g. Nuremberg/EU).
2. **A domain.** Create an **A record** (and **AAAA** if you enabled IPv6)
   pointing your chosen hostname (e.g. `app.yourdomain.com` or the apex) to the
   server's public IP. ACME needs ports 80/443 reachable on that name.
3. **A Resend account** (free) with your domain verified — add the SPF/DKIM/DMARC
   records Resend shows so email verification and alerts actually deliver.
4. *(Optional)* A **Stripe** account (test mode is enough to demonstrate billing)
   and a **Google OAuth** client if you want social login.

## 1. Prepare the host

SSH in as root and run the bootstrap (installs Docker, opens 22/80/443, clones
the repo to `/opt/outside`):

```bash
curl -fsSL https://raw.githubusercontent.com/domcolelak/outside/master/ops/staging/bootstrap.sh | sudo bash
```

## 2. Configure secrets

```bash
cd /opt/outside
install -m 0600 ops/staging/.env.staging.example .env.staging
```

Edit `.env.staging`:

- `STAGING_DOMAIN` — your hostname, e.g. `app.yourdomain.com`
- `APP_URL` — `https://app.yourdomain.com`
- `HTTPS_PORT` — `443`
- `OUTSIDE_IMAGE`, `OUTSIDE_MIGRATOR_IMAGE`, `OUTSIDE_BACKUP_IMAGE` — leave the
  defaults; the stack builds them locally with `--build`.
- All secrets — use independent random values (see the operator handoff for a
  generated set). `POSTGRES_PASSWORD`, `AUTH_SECRET`, `OUTSIDE_VERIFY_SECRET`,
  `CRON_SECRET`, `GUARDIAN_ENCRYPTION_KEY`, `ENTERPRISE_ENCRYPTION_KEY`,
  `ENTERPRISE_PROVISIONING_TOKEN`, `AUDIT_IP_SALT`, `GRAFANA_ADMIN_PASSWORD`.
- `RESEND_API_KEY`, `EMAIL_FROM` — from your Resend account and verified domain.

Generate the backup encryption identity once and store it **outside** the server
(a password manager); losing it makes backups unrecoverable:

```bash
docker compose --env-file .env.staging -f ops/staging/compose.yaml build backup
docker run --rm --entrypoint age-keygen outside-staging-backup
# copy the AGE-SECRET-KEY-1... line into BACKUP_ENCRYPTION_KEY
```

## 3. Deploy

```bash
docker compose --env-file .env.staging \
  -f ops/staging/compose.yaml \
  -f ops/staging/compose.public.yaml \
  config --quiet   # validate

docker compose --env-file .env.staging \
  -f ops/staging/compose.yaml \
  -f ops/staging/compose.public.yaml \
  up --detach --build
```

The `migrate` service applies the schema before the app starts; Caddy obtains a
Let's Encrypt certificate automatically on first request.

## 4. Verify

```bash
curl --fail https://app.yourdomain.com/api/livez
curl --fail https://app.yourdomain.com/api/readyz         # expects "ready"
curl --fail --no-buffer 'https://app.yourdomain.com/api/scan?target=northstar&mode=demo' | grep '"type":"result"'
```

Then in a browser confirm the full flows: sign up, receive the verification
email, verify a domain, run an authenticated scan, open Guardian, and (with
Stripe test keys) start a checkout.

## 5. Operate

- **Grafana**: bound to `127.0.0.1:3001` on the VM. Reach it over an SSH tunnel:
  `ssh -L 3001:127.0.0.1:3001 root@<server-ip>` then open `http://localhost:3001`.
- **Alertmanager** writes to the bundled sink by default — before real use, point
  it at an on-call destination and send a test alert.
- **Backups**: encrypted logical dumps run on `BACKUP_INTERVAL_SECONDS`; restore
  with `ops/staging/backup/restore.sh` into a clean database.
- **Updates**: re-run the bootstrap (or `git pull`) then repeat step 3; the
  migrator runs before the new app version starts.

See `ops/staging/README.md` for the full topology and `docs/DISASTER_RECOVERY.md`
for recovery procedures.
