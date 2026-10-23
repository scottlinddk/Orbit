#!/usr/bin/env bash
# Upgrade a real database from the previous release, verify data and snapshot, then roll back.
# Needs a full git checkout, Docker Compose, Node and curl. Uses only its own project and volume.
# ORBIT_UPGRADE_FROM overrides the previous release ref; ORBIT_UPGRADE_TO_IMAGE reuses a built image.
set -euo pipefail
cd "$(dirname "$0")/.."

# No release has been tagged yet. Until one exists, test the last main revision before migrations 6-11.
BASELINE=90e511ecbaa3aef22321022a0503f5b2f63bd657
FROM="${ORBIT_UPGRADE_FROM:-$(git describe --tags --match 'v[0-9]*' --abbrev=0 HEAD^ 2>/dev/null || printf '%s' "$BASELINE")}"
git rev-parse --verify "$FROM^{commit}" >/dev/null
PROJECT="orbit-upgrade-$$"
WORK="$(mktemp -d)"
OLD_IMAGE="$PROJECT:previous"
NEW_IMAGE="${ORBIT_UPGRADE_TO_IMAGE:-$PROJECT:candidate}"
export ORBIT_HOST_PORT="${ORBIT_UPGRADE_PORT:-3066}"
export ORBIT_PUBLIC_URL="http://127.0.0.1:$ORBIT_HOST_PORT"
export ORBIT_REGISTRATION=first-user-only ORBIT_SETUP_CODE=upgrade-test-setup-code
export ORBIT_TRUST_PROXY=false ORBIT_BACKUP_INTERVAL_HOURS=0 ORBIT_LOCAL_LOGIN=enabled
export ORBIT_OIDC_ISSUER= ORBIT_OIDC_CLIENT_ID= ORBIT_OIDC_CLIENT_SECRET=
export ORBIT_SECRET_KEY=upgrade-test-only-key-at-least-32-characters
export ORBIT_UPGRADE_IMAGE="$OLD_IMAGE"
BASE="$ORBIT_PUBLIC_URL/api/v1"
cat > "$WORK/image.yaml" <<'YAML'
services:
  orbit:
    image: ${ORBIT_UPGRADE_IMAGE:?}
    restart: 'no'
YAML
COMPOSE=(docker compose --env-file /dev/null -p "$PROJECT" -f compose.yaml -f "$WORK/image.yaml")
dc() { "${COMPOSE[@]}" "$@"; }
step() { printf '\n==> %s\n' "$*"; }
fail() { printf 'FAILED: %s\n' "$*" >&2; exit 1; }
expect() { [ "$2" = "$3" ] || fail "$1: expected $3, got $2"; }
cleanup() {
  local status=$?
  if [ "$status" != 0 ]; then dc logs --no-color --tail 60 >&2 || true; fi
  dc down -v --remove-orphans >/dev/null 2>&1 || true
  docker image rm "$OLD_IMAGE" >/dev/null 2>&1 || true
  if [ -z "${ORBIT_UPGRADE_TO_IMAGE:-}" ]; then docker image rm "$NEW_IMAGE" >/dev/null 2>&1 || true; fi
  rm -rf "$WORK"
}
trap cleanup EXIT

field() {
  node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{let v=JSON.parse(s);for(const k of process.argv[1].split("."))v=v[k];process.stdout.write(String(v))})' "$1"
}
api() {
  local path=$1
  shift
  curl --fail --silent --show-error -b "$WORK/cookies" -H 'content-type: application/json' "$BASE/$path" "$@"
}
login() {
  curl --fail --silent --show-error -c "$WORK/cookies" -H 'content-type: application/json' \
    -d '{"username":"upgrade-owner","password":"upgrade test passphrase"}' "$BASE/auth/login" >/dev/null
}
start() {
  dc up -d --no-build --pull never
  for _ in $(seq 1 80); do
    if curl --fail --silent "$BASE/health" >/dev/null; then return; fi
    local container
    container="$(dc ps -aq orbit)"
    if [ -n "$container" ] && [ "$(docker inspect -f '{{.State.Status}}' "$container")" = exited ]; then
      fail 'instance exited before becoming ready'
    fi
    sleep 1
  done
  fail 'instance did not start'
}
schema() {
  dc exec -T orbit node --disable-warning=ExperimentalWarning -e \
    'const {DatabaseSync}=require("node:sqlite");const d=new DatabaseSync(process.argv[1],{readOnly:true});console.log(d.prepare("SELECT MAX(version) AS v FROM schema_migrations").get().v);d.close()' \
    "${1:-/data/orbit.sqlite}"
}
check_data() {
  login
  expect 'household survived' "$(api "households/$HOUSEHOLD" | field name)" 'Upgrade household'
  expect 'dashboard survived' "$(api "dashboards/$DASHBOARD" | field name)" 'Before upgrade'
  expect 'feed token survived' "$(curl --fail --silent --show-error -H "Authorization: Bearer $FEED_TOKEN" "$BASE/feed" | field household.name)" 'Upgrade household'
  expect 'invitation survived' "$(api 'invitations/preview' -X POST -d "{\"token\":\"$INVITE_TOKEN\"}" | field householdName)" 'Upgrade household'
}

step "Build previous version ($FROM)"
mkdir "$WORK/source"
git archive "$FROM" | tar -x -C "$WORK/source"
docker build -t "$OLD_IMAGE" "$WORK/source"
if [ -z "${ORBIT_UPGRADE_TO_IMAGE:-}" ]; then
  step 'Build candidate image'
  docker build -t "$NEW_IMAGE" .
fi

step 'Seed the previous version through its API'
start
curl --fail --silent --show-error -H 'content-type: application/json' \
  -d '{"username":"upgrade-owner","password":"upgrade test passphrase","setupCode":"upgrade-test-setup-code"}' "$BASE/auth/register" >/dev/null
login
HOUSEHOLD="$(api households -X POST -d '{"name":"Upgrade household"}' | field id)"
DASHBOARD="$(api "households/$HOUSEHOLD/dashboards" -X POST -d '{"name":"Before upgrade"}' | field id)"
FEED_TOKEN="$(api "households/$HOUSEHOLD/feeds" -X POST -d '{"name":"Upgrade feed","fields":["household.name"]}' | field token)"
INVITE_TOKEN="$(api "households/$HOUSEHOLD/invitations" -X POST -d '{}' | field token)"
OLD_SCHEMA="$(schema)"
dc exec -T orbit orbit backup /data/backups/before-upgrade.sqlite
check_data
dc stop orbit

step 'Upgrade the existing volume and check credentials, data and tokens'
export ORBIT_UPGRADE_IMAGE="$NEW_IMAGE"
start
NEW_SCHEMA="$(schema)"
check_data
dc exec -T orbit orbit config validate
dc exec -T -e ORBIT_PUBLIC_URL=http://127.0.0.1:3000 orbit orbit doctor
dc exec -T orbit orbit verify /data/orbit.sqlite

SNAPSHOT=/data/backups/before-upgrade.sqlite
if [ "$NEW_SCHEMA" -gt "$OLD_SCHEMA" ]; then
  step 'Verify the automatic snapshot contains the previous schema'
  SNAPSHOT="$(dc exec -T orbit sh -c 'ls /data/backups/pre-migration-*.sqlite')"
  expect 'snapshot schema' "$(schema "$SNAPSHOT")" "$OLD_SCHEMA"
  dc exec -T orbit orbit verify "$SNAPSHOT"
  dc stop orbit
  step 'The previous image refuses to start on the upgraded schema'
  set +e
  ORBIT_UPGRADE_IMAGE="$OLD_IMAGE" timeout 20 "${COMPOSE[@]}" run --rm --no-deps orbit > "$WORK/downgrade.log" 2>&1
  status=$?
  set -e
  [ "$status" = 1 ] && grep -q 'only knows up to' "$WORK/downgrade.log" || fail 'downgrade was not refused with a schema error'
else
  expect 'schema never decreases' "$NEW_SCHEMA" "$OLD_SCHEMA"
  step 'No schema change; rollback uses the manual pre-upgrade backup'
  dc stop orbit
fi

step 'Restore the old database and run the previous image again'
dc run --rm --no-deps orbit orbit restore "$SNAPSHOT"
export ORBIT_UPGRADE_IMAGE="$OLD_IMAGE"
start
expect 'restored schema' "$(schema)" "$OLD_SCHEMA"
check_data
printf '\nUpgrade and rollback passed: schema %s -> %s -> %s.\n' "$OLD_SCHEMA" "$NEW_SCHEMA" "$OLD_SCHEMA"
