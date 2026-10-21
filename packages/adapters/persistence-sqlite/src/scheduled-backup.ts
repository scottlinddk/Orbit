import { chmodSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { backupDatabase } from './backup.ts'
import type { Database } from './database.ts'

export interface ScheduledBackupOptions {
  /** Folder that receives the backups. Created with owner-only access when missing. */
  directory: string
  /** How many scheduled backups to keep, newest first. */
  keep: number
  /** A new backup is written when the newest one is at least this old. */
  intervalMs: number
  now?: () => Date
}

const FILE = /^scheduled-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.sqlite$/
const PARTIAL = /^scheduled-.*\.partial$/

/**
 * Writes a backup with the same routine as `orbit backup` when none exists yet or the newest is
 * older than the interval, then prunes to `keep`. Returns the file, or undefined when nothing was
 * due. Call it on a timer shorter than the interval: because it looks at the files, a restart or
 * a server that was switched off still gets its backup on the next call.
 *
 * The file is written under a temporary name and renamed once complete, so a crash or full disk
 * never leaves something that looks like a good backup.
 */
export async function runScheduledBackupIfDue(
  db: Database,
  options: ScheduledBackupOptions,
): Promise<string | undefined> {
  const now = options.now?.() ?? new Date()
  mkdirSync(options.directory, { recursive: true, mode: 0o700 })
  const names = readdirSync(options.directory)
  // Leftovers from an interrupted run.
  for (const name of names.filter((n) => PARTIAL.test(n))) {
    rmSync(join(options.directory, name), { force: true })
  }

  const newest = names
    .map((name) => FILE.exec(name)?.[1])
    .filter((stamp): stamp is string => stamp !== undefined)
    .sort()
    .at(-1)
  if (newest && now.getTime() - stampToDate(newest).getTime() < options.intervalMs) {
    return undefined
  }

  const stamp = now.toISOString().replace(/[:.]/g, '-')
  const final = join(options.directory, `scheduled-${stamp}.sqlite`)
  const partial = join(options.directory, `scheduled-${stamp}.partial`)
  try {
    await backupDatabase(db, partial)
    // The file holds password hashes and household data. Keep it private to the owner.
    chmodSync(partial, 0o600)
    renameSync(partial, final)
  } catch (error) {
    rmSync(partial, { force: true })
    throw error
  }
  prune(options.directory, options.keep, final)
  return final
}

/** `2026-01-02T03-04-05-000Z` back to a date. */
function stampToDate(stamp: string): Date {
  return new Date(stamp.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, 'T$1:$2:$3.$4Z'))
}

function prune(directory: string, keep: number, justWritten: string) {
  const files = readdirSync(directory)
    .filter((name) => FILE.test(name))
    // The stamp is ISO time, so it sorts in time order as text.
    .sort()
    .reverse()
  for (const old of files.slice(Math.max(keep, 1))) {
    const path = join(directory, old)
    if (path !== justWritten) rmSync(path, { force: true })
  }
}
