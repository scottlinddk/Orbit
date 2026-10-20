# Backup and restore

Orbit stores all platform-owned data in one SQLite database (plus its `-wal` and `-shm` files while running).

## Back up

Use the online backup, which is consistent while Orbit is running:

```ts
import { backupDatabase } from '@orbit/adapter-persistence-sqlite'
await backupDatabase(db, '/backups/orbit-2026-10-20.sqlite')
```

A CLI command and a scheduled backup job arrive with the deployment work. Until then this is the supported way.

Do not copy `orbit.sqlite` with `cp` while Orbit is running. With WAL, recent writes sit in `orbit.sqlite-wal`, so a plain copy can miss them or be inconsistent.

`backupDatabase` refuses to overwrite an existing file.

## Restore

1. Stop Orbit.
2. Move the damaged `orbit.sqlite`, `orbit.sqlite-wal` and `orbit.sqlite-shm` aside.
3. Put the backup at the configured database path.
4. Start Orbit. Pending migrations run automatically. A backup made by a newer Orbit than the one you run is refused.

## What is tested

`packages/adapters/persistence-sqlite/src/backup.test.ts` backs up a live WAL database, discards it, restores from the backup and checks the data, including that writes made after the backup are absent.

## Not covered by a database backup

Credentials for external integrations and anything stored outside the database are not part of it. This is documented per integration as integrations land.
