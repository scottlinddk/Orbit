import { chmodSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { backupDatabase } from './backup.ts'
import type { Database } from './database.ts'
import { migrations as builtIn, type Migration } from './migrations.ts'

export interface SnapshotOptions {
  /** Folder that receives the snapshots. Created with owner-only access when missing. */
  directory: string
  /** How many pre-migration snapshots to keep, newest first. */
  keep: number
  available?: readonly Migration[]
  now?: () => Date
}

const FILE = /^pre-migration-(\d+)-(.+)\.sqlite$/

/**
 * Writes a snapshot with the same routine as `orbit backup` when migrations are about to change
 * a database that already holds data. Returns the file path, or undefined when there is nothing
 * to protect (a new database) or nothing to apply.
 *
 * Throws when the snapshot cannot be written. The caller must then not migrate: an upgrade
 * without a way back is worse than a server that refuses to start.
 */
export async function snapshotBeforeMigration(
  db: Database,
  options: SnapshotOptions,
): Promise<string | undefined> {
  const available = options.available ?? builtIn
  const current = currentVersion(db)
  const latest = available.at(-1)?.version ?? 0
  // current > latest is a downgrade. migrate() refuses it, and a snapshot would not help.
  if (current === 0 || current >= latest) return undefined

  mkdirSync(options.directory, { recursive: true, mode: 0o700 })
  const stamp = (options.now?.() ?? new Date()).toISOString().replace(/[:.]/g, '-')
  const file = join(options.directory, `pre-migration-${current}-${stamp}.sqlite`)
  await backupDatabase(db, file)
  // The file holds password hashes and household data. Keep it private to the owner.
  chmodSync(file, 0o600)
  prune(options.directory, options.keep, file)
  return file
}

function currentVersion(db: Database): number {
  const table = db
    .prepare(
      "SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
    )
    .get()
  if (!table) return 0
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as {
    v: number | null
  }
  return row.v ?? 0
}

/** Removes the oldest snapshots beyond `keep`. Never removes `justWritten`. */
function prune(directory: string, keep: number, justWritten: string) {
  const snapshots = readdirSync(directory)
    .map((name) => ({ name, match: FILE.exec(name) }))
    .filter((entry): entry is { name: string; match: RegExpExecArray } => entry.match !== null)
    // The stamp is ISO time with ":" and "." replaced, so it sorts in time order as text.
    .sort((a, b) => (b.match[2] as string).localeCompare(a.match[2] as string))
  for (const old of snapshots.slice(Math.max(keep, 1))) {
    const path = join(directory, old.name)
    if (path !== justWritten) rmSync(path, { force: true })
  }
}
