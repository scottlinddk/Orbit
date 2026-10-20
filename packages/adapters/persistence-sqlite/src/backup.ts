import { existsSync } from 'node:fs'
import { backup } from 'node:sqlite'
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
}
