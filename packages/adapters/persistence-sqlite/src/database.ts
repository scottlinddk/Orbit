import { DatabaseSync } from 'node:sqlite'

export type Database = DatabaseSync

/**
 * Opens a database with the settings Orbit relies on.
 * - foreign keys on: SQLite leaves them off by default.
 * - WAL: readers do not block the writer. Not applicable to ':memory:'.
 * - busy timeout: a second connection (for example a backup) waits instead of failing at once.
 */
export function openDatabase(path: string): Database {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
  return db
}

/** Runs `work` in one write transaction. Rolls back and rethrows on any error. */
export function inTransaction<T>(db: Database, work: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
