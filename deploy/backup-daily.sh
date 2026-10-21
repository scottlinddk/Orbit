#!/usr/bin/env bash
# Run from cron on the Docker host: ./deploy/backup-daily.sh /private/off-device-backups
set -euo pipefail
umask 077

if [ "$#" -ne 1 ] || [ -z "$1" ]; then
  echo "Usage: $0 <backup-directory>" >&2
  exit 2
fi

cd "$(dirname "$0")/.."
mkdir -p -m 700 -- "$1"
backup_dir="$(cd "$1" && pwd -P)"
chmod 700 -- "$backup_dir"

stamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
name="scheduled-$stamp.sqlite"
inside="/data/backups/$name"

# The online SQLite backup includes committed WAL writes while Orbit is running.
docker compose exec -T orbit orbit backup "$inside"
docker compose cp "orbit:$inside" "$backup_dir/$name"
chmod 600 -- "$backup_dir/$name"

# Verify the copied file, not only the original inside the volume.
docker compose run --rm --no-deps -v "$backup_dir:/backups:ro" orbit orbit verify "/backups/$name"
docker compose exec -T orbit rm -- "$inside"

# Retain at least fourteen days of scheduled copies. Manual and migration backups are untouched.
find "$backup_dir" -maxdepth 1 -type f -name 'scheduled-*.sqlite' -mtime +13 -delete
echo "Verified backup: $backup_dir/$name"
