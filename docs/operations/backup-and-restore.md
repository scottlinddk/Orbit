# Backup and restore

Orbit stores all platform-owned data in one SQLite database (plus `-wal` and `-shm` files while it runs). Back it up with Orbit's own command, never with a file copy of a running database: with WAL, recent writes live in a separate file and a plain copy can be inconsistent.

## Commands

Run them on the server. In Docker prefix them with `docker compose exec orbit`, for example `docker compose exec orbit orbit backup ...`.

| Command                           | What it does                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `orbit backup <file>`             | Writes a consistent, self-contained copy. Safe while Orbit runs. Refuses to overwrite a file. The copy is private (0600). |
| `orbit verify <file>`             | Checks a backup: SQLite integrity, foreign keys, schema version. Reports what it holds. Changes nothing.                  |
| `orbit restore <file>`            | Verifies, then replaces the database. The old one is kept beside it as `.before-restore-<time>`. Orbit must be stopped.   |
| `orbit create-user <username>`    | Creates an account even when registration is closed. Password from a hidden prompt or stdin.                              |
| `orbit reset-password <username>` | New password from a hidden prompt, or piped on stdin. Signs that user out everywhere.                                     |

`restore` checks first and changes nothing if the file is not a good Orbit backup, comes from a newer Orbit, or the database is still in use.

## Back up

```sh
docker compose exec orbit orbit backup /data/backups/orbit-$(date +%F).sqlite
docker compose exec orbit orbit verify /data/backups/orbit-$(date +%F).sqlite
mkdir -p backups
docker compose cp orbit:/data/backups/orbit-$(date +%F).sqlite backups/
```

Store `backups/` somewhere other than this machine. The file contains password hashes and household data, so treat it like the database itself.

## Scheduled backups and retention

For a Docker install, `deploy/backup-daily.sh` makes a consistent backup while Orbit is running, copies it out of the Docker volume, verifies the **copied** file, and removes the temporary copy in the volume. It keeps scheduled copies for at least 14 days in the destination folder. It leaves manual backups and pre-migration snapshots alone. Give it an absolute path to a private folder on the Docker host:

```sh
./deploy/backup-daily.sh /srv/orbit-backups
```

Run it once manually, then schedule it on the host. For example, `crontab -e` for the account that runs Docker:

```cron
15 3 * * * cd /path/to/Orbit && ./deploy/backup-daily.sh /srv/orbit-backups >> /srv/orbit-backups/backup.log 2>&1
```

Use an absolute path for the log and watch for failures. The script exits nonzero if the backup, copy, or verification fails, and does not prune old files after such a failure. Copy the verified files to storage **outside this machine** as well; the 14-day folder does not protect against disk or host loss. Restrict access to that copy because it contains household data and password hashes. Periodically perform the restore drill below using a spare instance to prove the off-device copy works. Do not run the drill against your live database.

## Automatic snapshot before an upgrade

When Orbit starts and a schema migration is pending on a database that already holds data, it first writes a snapshot with the same routine as `orbit backup` to `backups/pre-migration-<schema>-<time>.sqlite` next to the database (in Docker, `/data/backups`). `<schema>` is the schema version the snapshot holds, so `pre-migration-2-...` is a database from before the move to version 3. The file is private (0600). The newest 5 are kept (`ORBIT_MIGRATION_SNAPSHOTS`). A new database gets none. If the snapshot cannot be written, for example because the disk is full, Orbit stops with an error and does **not** migrate.

To go back after a bad upgrade, stop Orbit, install the older version, and restore the snapshot:

```sh
docker compose stop orbit
docker compose run --rm --no-deps orbit orbit restore /data/backups/pre-migration-2-<time>.sqlite
```

The snapshot lives in the same volume as the database, so it does not protect against losing the volume. Copy backups off the machine as described above.

## Restore

```sh
chmod a+r backups/orbit-2026-10-20.sqlite     # the container user (uid 1000) must be able to read it
docker compose stop orbit
docker compose run --rm --no-deps -v "$PWD/backups:/backups:ro" orbit \
  orbit restore /backups/orbit-2026-10-20.sqlite
docker compose up -d
```

Restoring onto a brand new install (empty volume) works the same way. Pending migrations run when Orbit starts.

Without Docker: stop Orbit, run `orbit restore <file>` with the same `ORBIT_DATABASE_PATH`, start Orbit.

## What is tested

`deploy/smoke-test.sh` runs the whole disaster drill against the real image and runs in CI on every change:

1. start the container, create data through the browser suite
2. `backup`, `verify`, copy out of the container
3. confirm `restore` is **refused** while Orbit runs
4. destroy the volume (`docker compose down -v`), start empty, confirm the account is gone
5. `restore` from a read-only mount, start, log in, confirm the data is back
6. `reset-password`, confirm the old password and old sessions stop working

Unit tests cover the same commands against temporary databases, including corrupted, foreign and newer-version files.

## What a database backup does not contain

Credentials for external integrations and anything stored outside the database are not part of it. This is documented per integration as integrations land.
