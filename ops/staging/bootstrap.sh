#!/usr/bin/env bash
# Prepare a fresh Ubuntu 22.04/24.04 host to run the OUTSIDE staging stack.
# Idempotent: installs Docker Engine + Compose plugin, opens the web ports, and
# clones the repository to /opt/outside. It never writes secrets — create
# .env.staging by hand afterwards (see docs/HETZNER_DEPLOY.md).
set -euo pipefail

REPO="${OUTSIDE_REPO:-https://github.com/domcolelak/outside.git}"
APP_DIR="${OUTSIDE_DIR:-/opt/outside}"

if [ "$(id -u)" -ne 0 ]; then echo "Run as root (sudo)." >&2; exit 1; fi

echo "==> Installing base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git ufw

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker Engine"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

echo "==> Configuring firewall (SSH + HTTP + HTTPS only)"
ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

echo "==> Fetching the application"
if [ -d "${APP_DIR}/.git" ]; then
  git -C "${APP_DIR}" fetch --depth 1 origin master && git -C "${APP_DIR}" reset --hard origin/master
else
  git clone --depth 1 "${REPO}" "${APP_DIR}"
fi

cat <<EOF

==> Host is ready.
Next steps (see docs/HETZNER_DEPLOY.md):
  1. cd ${APP_DIR}
  2. install -m 0600 ops/staging/.env.staging.example .env.staging
  3. Edit .env.staging: set STAGING_DOMAIN, APP_URL, HTTPS_PORT=443, and every secret.
     Generate the backup key once:
       docker compose --env-file .env.staging -f ops/staging/compose.yaml build backup
       docker run --rm --entrypoint age-keygen outside-staging-backup   # -> BACKUP_ENCRYPTION_KEY
  4. docker compose --env-file .env.staging -f ops/staging/compose.yaml -f ops/staging/compose.public.yaml up --detach --build
  5. curl --fail https://<STAGING_DOMAIN>/api/readyz
EOF
