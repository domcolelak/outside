#!/usr/bin/env bash
# Deploy the current repository state to the running OUTSIDE staging stack.
#
# Builds the application image with real build provenance (git SHA + build time,
# surfaced by /api/readyz and OpenTelemetry) and recreates the app container.
# App/migrator images are `image:`-only in compose (never built by compose), so
# they are built and tagged here first. Idempotent and safe to re-run.
#
#   ops/staging/deploy.sh                 # app only, from origin/master
#   ops/staging/deploy.sh --migrate       # also rebuild + run the migrator
#   ops/staging/deploy.sh --ref <git-ref> # deploy a specific ref
#   ops/staging/deploy.sh --no-pull       # deploy the working tree as-is
set -euo pipefail

APP_DIR="${OUTSIDE_DIR:-/opt/outside}"
ENV_FILE="${OUTSIDE_ENV_FILE:-$APP_DIR/.env.staging}"
REF="origin/master"
MIGRATE=0
PULL=1

while [ $# -gt 0 ]; do
  case "$1" in
    --migrate) MIGRATE=1 ;;
    --no-pull) PULL=0 ;;
    --ref) REF="$2"; shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

cd "$APP_DIR"
[ -f "$ENV_FILE" ] || { echo "Missing env file: $ENV_FILE" >&2; exit 1; }

# Image tags come from the env file so they stay consistent with compose.
APP_IMAGE="$(grep -E '^OUTSIDE_IMAGE=' "$ENV_FILE" | tail -1 | cut -d= -f2-)"
MIGRATOR_IMAGE="$(grep -E '^OUTSIDE_MIGRATOR_IMAGE=' "$ENV_FILE" | tail -1 | cut -d= -f2-)"
APP_VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo "0.0.0")"
: "${APP_IMAGE:?OUTSIDE_IMAGE must be set in $ENV_FILE}"
: "${MIGRATOR_IMAGE:?OUTSIDE_MIGRATOR_IMAGE must be set in $ENV_FILE}"

if [ "$PULL" -eq 1 ]; then
  echo "==> Fetching ${REF}"
  git fetch --depth 1 origin "${REF#origin/}"
  git reset --hard "$REF"
fi

GIT_SHA="$(git rev-parse HEAD)"
BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "==> Deploying ${GIT_SHA} (built ${BUILD_TIME})"

BUILD_ARGS=(--build-arg "APP_VERSION=$APP_VERSION" --build-arg "GIT_SHA=$GIT_SHA" --build-arg "BUILD_TIME=$BUILD_TIME")

COMPOSE=(docker compose --env-file "$ENV_FILE" -f ops/staging/compose.yaml)
[ -f ops/staging/compose.public.yaml ] && COMPOSE+=(-f ops/staging/compose.public.yaml)

echo "==> Building app image ${APP_IMAGE}"
docker build --target runner "${BUILD_ARGS[@]}" -t "$APP_IMAGE" .

if [ "$MIGRATE" -eq 1 ]; then
  echo "==> Building migrator image ${MIGRATOR_IMAGE}"
  docker build --target migrator "${BUILD_ARGS[@]}" -t "$MIGRATOR_IMAGE" .
  echo "==> Recreating migrate + app"
  "${COMPOSE[@]}" up -d --force-recreate migrate app
else
  echo "==> Recreating app"
  "${COMPOSE[@]}" up -d --force-recreate app
fi

echo "==> Waiting for readiness"
for _ in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3000/api/readyz >/dev/null 2>&1; then
    echo "==> Ready:"
    curl -fsS http://127.0.0.1:3000/api/readyz
    echo
    exit 0
  fi
  sleep 2
done
echo "!! App did not become ready in time" >&2
exit 1
