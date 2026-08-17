#!/usr/bin/env bash
# Deploy a clean repository revision to the running OUTSIDE staging stack.
#
# Builds SHA-scoped local application and migrator images with real provenance,
# applies every pending migration, and only then recreates the app container.
# Configured release tags/digests are used as repository names but are never
# overwritten by a source build.
#
#   ops/staging/deploy.sh                 # master, migrations always included
#   ops/staging/deploy.sh --ref <git-ref> # deploy a specific ref
#   ops/staging/deploy.sh --no-pull       # deploy the clean checked-out commit
#   ops/staging/deploy.sh --migrate       # accepted for backwards compatibility
set -euo pipefail

APP_DIR="${OUTSIDE_DIR:-/opt/outside}"
ENV_FILE="${OUTSIDE_ENV_FILE:-$APP_DIR/.env.staging}"
REF="master"
PULL=1

while [ "$#" -gt 0 ]; do
  case "$1" in
    --migrate) ;; # Migrations are mandatory for every deployment.
    --no-pull) PULL=0 ;;
    --ref)
      [ "$#" -ge 2 ] || { echo "--ref requires a git ref" >&2; exit 2; }
      REF="$2"
      shift
      ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

cd "$APP_DIR"
[ -f "$ENV_FILE" ] || { echo "Missing env file: $ENV_FILE" >&2; exit 1; }

if [ "$PULL" -eq 1 ]; then
  remote_ref="${REF#origin/}"
  if ! git check-ref-format "refs/outside/input/${remote_ref}" >/dev/null 2>&1; then
    echo "Invalid deployment ref: ${REF}" >&2
    exit 2
  fi
  echo "==> Fetching ${remote_ref}"
  git fetch --depth 1 --no-tags origin "$remote_ref"
  fetched_commit="$(git rev-parse --verify 'FETCH_HEAD^{commit}')"
  deploy_ref="refs/outside/deploy-candidate"
  git update-ref "$deploy_ref" "$fetched_commit"
  git reset --hard "$deploy_ref"
fi

if [ -n "$(git status --porcelain --untracked-files=normal)" ]; then
  echo "Refusing to build a dirty working tree because its contents would not match the release commit." >&2
  git status --short >&2
  exit 1
fi

GIT_SHA="$(git rev-parse HEAD)"
BUILD_TIME="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

# Read version and image configuration only after the exact source revision is
# checked out, otherwise the embedded version can describe the previous commit.
APP_VERSION="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' package.json | head -1)"
APP_VERSION="${APP_VERSION:-0.0.0}"
CONFIGURED_APP_IMAGE="$(grep -E '^OUTSIDE_IMAGE=' "$ENV_FILE" | tail -1 | cut -d= -f2-)"
CONFIGURED_MIGRATOR_IMAGE="$(grep -E '^OUTSIDE_MIGRATOR_IMAGE=' "$ENV_FILE" | tail -1 | cut -d= -f2-)"
CONFIGURED_BACKUP_IMAGE="$(grep -E '^OUTSIDE_BACKUP_IMAGE=' "$ENV_FILE" | tail -1 | cut -d= -f2-)"
: "${CONFIGURED_APP_IMAGE:?OUTSIDE_IMAGE must be set in $ENV_FILE}"
: "${CONFIGURED_MIGRATOR_IMAGE:?OUTSIDE_MIGRATOR_IMAGE must be set in $ENV_FILE}"
: "${CONFIGURED_BACKUP_IMAGE:?OUTSIDE_BACKUP_IMAGE must be set in $ENV_FILE}"

image_repository() {
  local reference="${1%@*}"
  local final_component="${reference##*/}"
  if [[ "$final_component" == *:* ]]; then reference="${reference%:*}"; fi
  printf '%s\n' "$reference"
}

safe_version="$(printf '%s' "$APP_VERSION" | tr -c 'A-Za-z0-9_.-' '-')"
local_tag="${safe_version}-local-${GIT_SHA:0:12}"
OUTSIDE_IMAGE="$(image_repository "$CONFIGURED_APP_IMAGE"):${local_tag}"
OUTSIDE_MIGRATOR_IMAGE="$(image_repository "$CONFIGURED_MIGRATOR_IMAGE"):${local_tag}"
OUTSIDE_BACKUP_IMAGE="$(image_repository "$CONFIGURED_BACKUP_IMAGE"):${local_tag}"
export OUTSIDE_IMAGE OUTSIDE_MIGRATOR_IMAGE OUTSIDE_BACKUP_IMAGE

echo "==> Deploying ${GIT_SHA} (built ${BUILD_TIME})"
echo "==> Source-build images: ${OUTSIDE_IMAGE}, ${OUTSIDE_MIGRATOR_IMAGE}, ${OUTSIDE_BACKUP_IMAGE}"

BUILD_ARGS=(
  --build-arg "APP_VERSION=$APP_VERSION"
  --build-arg "GIT_SHA=$GIT_SHA"
  --build-arg "BUILD_TIME=$BUILD_TIME"
)

COMPOSE=(docker compose --env-file "$ENV_FILE" -f ops/staging/compose.yaml)
[ -f ops/staging/compose.public.yaml ] && COMPOSE+=(-f ops/staging/compose.public.yaml)

echo "==> Building app, migrator and backup from the same commit"
docker build --target runner "${BUILD_ARGS[@]}" -t "$OUTSIDE_IMAGE" .
docker build --target migrator "${BUILD_ARGS[@]}" -t "$OUTSIDE_MIGRATOR_IMAGE" .
docker build -t "$OUTSIDE_BACKUP_IMAGE" ops/staging/backup
"${COMPOSE[@]}" config --quiet
echo "==> Starting private analytics and applying its idempotent bootstrap"
"${COMPOSE[@]}" up -d analytics-db analytics
"${COMPOSE[@]}" up -d --force-recreate analytics-bootstrap
ANALYTICS_BOOTSTRAP_CID="$("${COMPOSE[@]}" ps -q --all analytics-bootstrap)"
[ -n "$ANALYTICS_BOOTSTRAP_CID" ] || { echo "!! Analytics bootstrap container was not created" >&2; exit 1; }
for _ in $(seq 1 60); do
  bootstrap_status="$(docker inspect --format '{{.State.Status}}' "$ANALYTICS_BOOTSTRAP_CID" 2>/dev/null || echo missing)"
  if [ "$bootstrap_status" = "exited" ]; then
    bootstrap_exit="$(docker inspect --format '{{.State.ExitCode}}' "$ANALYTICS_BOOTSTRAP_CID")"
    if [ "$bootstrap_exit" = "0" ]; then
      echo "==> Analytics bootstrap completed."
      break
    fi
    "${COMPOSE[@]}" logs --no-color analytics-bootstrap >&2
    echo "!! Analytics bootstrap failed with exit code ${bootstrap_exit}" >&2
    exit 1
  fi
  [ "$bootstrap_status" = "dead" ] && { echo "!! Analytics bootstrap container died" >&2; exit 1; }
  sleep 2
done
[ "${bootstrap_status:-missing}" = "exited" ] || { echo "!! Analytics bootstrap did not finish in time" >&2; exit 1; }
"${COMPOSE[@]}" up -d --force-recreate analytics-backup analytics-retention

echo "==> Applying migrations before recreating the app and edge proxy"
"${COMPOSE[@]}" up -d --force-recreate migrate app caddy
"${COMPOSE[@]}" up -d --force-recreate backup

# The app port is not published on the host (it sits behind the reverse proxy),
# so use its liveness HEALTHCHECK and then require database readiness plus exact
# release identity from inside the container.
echo "==> Waiting for readiness"
APP_CID="$("${COMPOSE[@]}" ps -q app)"
for _ in $(seq 1 30); do
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$APP_CID" 2>/dev/null || echo missing)"
  if [ "$status" = "healthy" ]; then
    if docker exec -e "EXPECTED_GIT_SHA=${GIT_SHA}" "$APP_CID" node -e \
      "fetch('http://127.0.0.1:3000/api/readyz').then(async r=>{const body=await r.json();console.log(JSON.stringify(body));if(!r.ok||body.status!=='ready'||body.release?.commit!==process.env.EXPECTED_GIT_SHA)process.exit(1)}).catch(()=>process.exit(1))"; then
      echo "==> App is ready with the expected release identity."
      exit 0
    fi
  fi
  [ "$status" = "unhealthy" ] && { echo "!! App reported unhealthy" >&2; exit 1; }
  sleep 3
done
echo "!! App did not become ready in time" >&2
exit 1
