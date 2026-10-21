#!/usr/bin/env bash
# Proves the Docker deployment works end to end, including disaster recovery:
#   build -> start -> browser test -> backup -> verify -> destroy the data -> restore -> log in
#   -> reset a password.
# Needs docker, node, curl. Set RUN_E2E=1 to include the browser suite (needs Playwright).
# Set SKIP_BUILD=1 to reuse an existing orbit:local image.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${ORBIT_HOST_PORT:-3055}"
export ORBIT_HOST_PORT="$PORT" ORBIT_PUBLIC_URL="http://127.0.0.1:$PORT"
BASE="$ORBIT_PUBLIC_URL"
WORK="$(mktemp -d)"
NODE_JSON='let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const v=JSON.parse(d);console.log(eval("v"+process.argv[1]))})'

step() { printf '\n==> %s\n' "$*"; }
fail() { printf 'FAILED: %s\n' "$*" >&2; docker compose logs --no-color --tail 40 orbit >&2 || true; exit 1; }
expect() { [ "$2" = "$3" ] || fail "$1: expected $3, got $2"; }
cleanup() { docker compose down -v >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

wait_healthy() {
  for _ in $(seq 1 40); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' orbit-orbit-1 2>/dev/null || true)" = healthy ] && return 0
    sleep 2
  done
  fail "orbit did not become healthy"
}

login_status() { # username password -> HTTP status, cookie kept in $WORK/jar
  curl -s -o /dev/null -w '%{http_code}' -c "$WORK/jar" -X POST "$BASE/api/v1/auth/login" \
    -H 'content-type: application/json' -d "{\"username\":\"$1\",\"password\":\"$2\"}"
}

docker compose down -v >/dev/null 2>&1 || true
if [ "${SKIP_BUILD:-0}" != 1 ]; then step "Build the image"; docker compose build; fi

step "Start and wait for the health check"
docker compose up -d --no-build
wait_healthy

step "The container is locked down"
expect "runs as non-root" "$(docker compose exec -T orbit id -u)" 1000
docker compose exec -T orbit sh -c 'touch /app/should-fail 2>/dev/null' && fail "root filesystem is writable"
docker compose exec -T orbit sh -c 'touch /data/ok' || fail "data volume is not writable"

step "The web app and the API answer on one port"
expect "shell" "$(curl -s -o /dev/null -w '%{http_code}' -H 'accept: text/html' "$BASE/d/anything")" 200
expect "health" "$(curl -s "$BASE/api/v1/health")" '{"status":"ok"}'

step "A new instance refuses the first account without its setup code"
expect "setup code required" "$(curl -s "$BASE/api/v1/auth/setup")" '{"setupCodeRequired":true}'
SETUP_CODE="$(docker compose logs --no-color orbit | grep -o 'setup code: [A-Z0-9-]*' | tail -1 | cut -d' ' -f3)"
[ -n "$SETUP_CODE" ] || fail "no setup code in the container log"
expect "register without the code" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/v1/auth/register" \
  -H 'content-type: application/json' -d '{"username":"scott","password":"correct horse battery"}')" 403
expect "register with a wrong code" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/v1/auth/register" \
  -H 'content-type: application/json' -d '{"username":"scott","password":"correct horse battery","setupCode":"AAAA-AAAA-AAAA"}')" 403

if [ "${RUN_E2E:-0}" = 1 ]; then
  step "Browser suite against the container"
  ORBIT_E2E_URL="$BASE" ORBIT_E2E_SETUP_CODE="$SETUP_CODE" pnpm --filter @orbit/e2e test
else
  step "Create the first account by API with the setup code (browser suite skipped)"
  expect "register" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/v1/auth/register" \
    -H 'content-type: application/json' -d "{\"username\":\"scott\",\"password\":\"correct horse battery\",\"setupCode\":\"$SETUP_CODE\"}")" 201
fi
expect "setup code is gone once the owner exists" "$(curl -s "$BASE/api/v1/auth/setup")" '{"setupCodeRequired":false}'
expect "login before the disaster" "$(login_status scott 'correct horse battery')" 200
HOUSEHOLD="$(curl -s -b "$WORK/jar" -X POST "$BASE/api/v1/households" -H 'content-type: application/json' -d '{"name":"Recovery drill"}' | node -e "$NODE_JSON" '.id')"

step "Back up inside the container, verify, and copy it out"
docker compose exec -T orbit orbit backup /data/backups/drill.sqlite
docker compose exec -T orbit orbit verify /data/backups/drill.sqlite
mkdir -p "$WORK/backups"
docker compose cp orbit:/data/backups/drill.sqlite "$WORK/backups/drill.sqlite"
chmod a+r "$WORK/backups/drill.sqlite"

step "Restoring over a running instance is refused"
if docker compose exec -T orbit orbit restore /data/backups/drill.sqlite; then fail "restore ran while Orbit was running"; fi

step "Disaster: destroy the volume"
docker compose down -v
docker compose up -d --no-build
wait_healthy
expect "login on the empty instance" "$(login_status scott 'correct horse battery')" 401

step "Restore from the backup onto the stopped instance"
docker compose stop orbit
docker compose run --rm --no-deps -v "$WORK/backups:/backups:ro" orbit orbit restore /backups/drill.sqlite
docker compose up -d --no-build
wait_healthy
expect "login after the restore" "$(login_status scott 'correct horse battery')" 200
expect "household came back" "$(curl -s -b "$WORK/jar" "$BASE/api/v1/households/$HOUSEHOLD" | node -e "$NODE_JSON" '.name')" "Recovery drill"

step "Create a second account on a closed instance, and use it"
printf '%s' 'bobs long passphrase' | docker compose exec -T orbit orbit create-user bobby
expect "new account can sign in" "$(login_status bobby 'bobs long passphrase')" 200
expect "registration stays closed on the web" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/v1/auth/register" \
  -H 'content-type: application/json' -d '{"username":"intruder","password":"another long passphrase"}')" 403

step "Reset a password from the command line"
expect "sign in before the reset" "$(login_status scott 'correct horse battery')" 200
cp "$WORK/jar" "$WORK/jar-before-reset"
printf '%s' 'a brand new passphrase' | docker compose exec -T orbit orbit reset-password scott
expect "old session ended" "$(curl -s -o /dev/null -w '%{http_code}' -b "$WORK/jar-before-reset" "$BASE/api/v1/auth/me")" 401
expect "old password refused" "$(login_status scott 'correct horse battery')" 401
expect "new password accepted" "$(login_status scott 'a brand new passphrase')" 200

printf '\nAll deployment checks passed.\n'
