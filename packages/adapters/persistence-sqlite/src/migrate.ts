import { inTransaction, type Database } from './database.ts'
import { migrations as builtIn, type Migration } from './migrations.ts'

/**
 * Applies pending migrations, each in its own transaction, and returns the versions applied.
 * Refuses to touch a database written by a newer Orbit, so a downgrade fails loudly
 * instead of corrupting data.
 */
export function migrate(db: Database, available: readonly Migration[] = builtIn): number[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT
  `)

  const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as {
    v: number | null
  }
  const current = row.v ?? 0
  const latest = available.at(-1)?.version ?? 0
  if (current > latest) {
    throw new Error(
      `Database is at schema version ${current} but this Orbit only knows up to ${latest}. ` +
        'Upgrade Orbit or restore a backup made by this version.',
    )
  }

  available.forEach((m, i) => {
    if (m.version !== i + 1) throw new Error(`Migration versions must be 1..n, got ${m.version}`)
  })

  const applied: number[] = []
  for (const m of available.filter((m) => m.version > current)) {
    inTransaction(db, () => {
      db.exec(m.sql)
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        m.version,
        m.name,
        new Date().toISOString(),
      )
    })
    applied.push(m.version)
  }
  return applied
}
