import { existsSync } from 'node:fs'
import { DatabaseSync, backup } from 'node:sqlite'
import type { Database } from './database.ts'

/**
 * Writes a consistent copy of the database to `destination` using SQLite's online backup,
 * which is safe while Orbit is running. Never copy the .sqlite file by hand while the app
 * runs: with WAL, recent writes live in a separate file and a plain copy can be inconsistent.
 *
 * Refuses to overwrite an existing file, so a typo cannot destroy a good backup.
 * Restore by stopping Orbit and putting the backup file at the configured database path.
 */
export async function backupDatabase(db: Database, destination: string): Promise<void> {
  if (existsSync(destination)) throw new Error(`Backup destination already exists: ${destination}`)
  await backup(db, destination)

  // The online backup copies the header, including "this file uses WAL". A WAL database cannot
  // be opened from a read-only mount and needs side files next to it. Switching the copy to
  // the classic journal makes the backup one self-contained file that opens anywhere.
  const copy = new DatabaseSync(destination)
  try {
    copy.exec('PRAGMA journal_mode = DELETE')
  } finally {
    copy.close()
  }
}
