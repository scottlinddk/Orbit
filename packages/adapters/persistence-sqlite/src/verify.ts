import type { Database } from './database.ts'
import { migrations } from './migrations.ts'

export interface VerifyReport {
  ok: boolean
  /** Schema version stored in the file, 0 when it has no migration table. */
  schemaVersion: number
  /** The newest version this Orbit understands. */
  latestKnownVersion: number
  counts: { users: number; households: number; dashboards: number }
  problems: string[]
}

const count = (db: Database, table: string) =>
  Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n)

/**
 * Checks a database file, typically a backup about to be restored: SQLite's own integrity
 * check, foreign keys, and whether this Orbit can read its schema. Read-only.
 */
export function verifyDatabase(db: Database): VerifyReport {
  const problems: string[] = []
  const latestKnownVersion = migrations.at(-1)?.version ?? 0

  const integrity = db.prepare('PRAGMA integrity_check').all() as { integrity_check: string }[]
  for (const row of integrity)
    if (row.integrity_check !== 'ok') problems.push(`integrity: ${row.integrity_check}`)

  const broken = db.prepare('PRAGMA foreign_key_check').all()
  if (broken.length > 0) problems.push(`${broken.length} foreign key violations`)

  const hasMigrations = db
    .prepare("SELECT 1 AS found FROM sqlite_master WHERE name = 'schema_migrations'")
    .get()
  if (!hasMigrations) {
    problems.push('not an Orbit database: no schema_migrations table')
    return {
      ok: false,
      schemaVersion: 0,
      latestKnownVersion,
      counts: { users: 0, households: 0, dashboards: 0 },
      problems,
    }
  }

  const schemaVersion = Number(
    (
      db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations').get() as {
        v: number
      }
    ).v,
  )
  if (schemaVersion > latestKnownVersion) {
    problems.push(
      `schema version ${schemaVersion} is newer than this Orbit understands (${latestKnownVersion})`,
    )
  }

  const counts =
    schemaVersion >= 1
      ? {
          users: count(db, 'users'),
          households: count(db, 'households'),
          dashboards: count(db, 'dashboards'),
        }
      : { users: 0, households: 0, dashboards: 0 }
  return { ok: problems.length === 0, schemaVersion, latestKnownVersion, counts, problems }
}
