import {
  accessSync,
  chmodSync,
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
} from 'node:fs'
import { dirname } from 'node:path'
import { backupDatabase, openDatabase, verifyDatabase } from '@orbit/adapter-persistence-sqlite'
import { InvariantViolation } from '@orbit/domain'
import { NotFoundError, UsernameTakenError } from '@orbit/application'
import { createSqliteServices } from './composition.ts'
import { ConfigError, loadConfig } from './config.ts'

export interface CliIo {
  out(line: string): void
  err(line: string): void
  /** Reads a new password without echoing it. Called only by commands that need one. */
  readPassword(): Promise<string>
}

export const USAGE = `Orbit operator commands. Run on the server that holds the database.

  backup <file>             Write a consistent copy of the database. Safe while Orbit runs.
  verify <file>             Check a backup before restoring it. Reads only.
  restore <file>            Replace the database with a verified backup. Stop Orbit first.
  create-user <username>    Create an account even though registration is closed.
  reset-password <username> Set a new password and sign that user out everywhere.

The database is the one ORBIT_DATABASE_PATH points to.`

const EXIT_OK = 0
const EXIT_FAILED = 1
const EXIT_USAGE = 2

export async function runCli(
  argv: string[],
  env: Record<string, string | undefined>,
  io: CliIo,
): Promise<number> {
  const [command, argument, ...extra] = argv
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    io.out(USAGE)
    return command ? EXIT_OK : EXIT_USAGE
  }
  if (!['backup', 'verify', 'restore', 'create-user', 'reset-password'].includes(command)) {
    io.err(`Unknown command "${command}".\n\n${USAGE}`)
    return EXIT_USAGE
  }
  if (!argument || extra.length > 0) {
    io.err(`"${command}" takes exactly one argument.\n\n${USAGE}`)
    return EXIT_USAGE
  }

  try {
    const config = loadConfig(env)
    if (command === 'verify') return verify(argument, io)
    if (command === 'restore') return restore(config.databasePath, argument, io)
    if (!existsSync(config.databasePath)) {
      io.err(`No database at ${config.databasePath}. Check ORBIT_DATABASE_PATH.`)
      return EXIT_FAILED
    }
    if (command === 'backup') return await backup(config.databasePath, argument, io)
    if (command === 'create-user') return await createUser(config, argument, io)
    return await resetPassword(config, argument, io)
  } catch (error) {
    if (error instanceof ConfigError || error instanceof InvariantViolation) {
      io.err(error.message)
    } else if (error instanceof NotFoundError) {
      io.err('No account with that username.')
    } else if (error instanceof UsernameTakenError) {
      io.err('That username is taken.')
    } else {
      io.err(`Failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    return EXIT_FAILED
  }
}

async function backup(databasePath: string, destination: string, io: CliIo): Promise<number> {
  mkdirSync(dirname(destination), { recursive: true })
  const db = openDatabase(databasePath)
  try {
    await backupDatabase(db, destination)
  } finally {
    db.close()
  }
  // The file holds password hashes and household data. Keep it private to the owner.
  chmodSync(destination, 0o600)
  io.out(`Backup written to ${destination}`)
  return EXIT_OK
}

/** Opens a backup read-only and reports on it. False when it must not be restored. */
function checkBackup(file: string, io: CliIo, quiet = false): boolean {
  let db: ReturnType<typeof openDatabase> | undefined
  try {
    // Say so plainly. SQLite would only report "unable to open database file".
    try {
      accessSync(file, constants.R_OK)
    } catch {
      io.err(
        `PROBLEM: cannot read ${file}. This command runs as user ${process.getuid?.() ?? 'unknown'}. Make the file readable (chmod a+r) or copy it into the data folder.`,
      )
      return false
    }
    db = openDatabase(file, { readOnly: true })
    const report = verifyDatabase(db)
    if (!quiet) {
      io.out(
        `schema version: ${report.schemaVersion} (this Orbit understands up to ${report.latestKnownVersion})`,
      )
      io.out(
        `contents: ${report.counts.users} users, ${report.counts.households} households, ${report.counts.dashboards} dashboards`,
      )
    }
    for (const problem of report.problems) io.err(`PROBLEM: ${problem}`)
    return report.ok
  } catch (error) {
    io.err(
      `PROBLEM: not a readable SQLite database (${error instanceof Error ? error.message : error}). If it came from an older Orbit or another tool, copy it to a writable folder and try again.`,
    )
    return false
  } finally {
    db?.close()
  }
}

function verify(file: string, io: CliIo): number {
  if (!existsSync(file)) {
    io.err(`No such file: ${file}`)
    return EXIT_FAILED
  }
  if (!checkBackup(file, io)) return EXIT_FAILED
  io.out('OK: this backup can be restored.')
  return EXIT_OK
}

/**
 * Puts a backup in place of the database. The current database is moved aside, never deleted,
 * so a restore of the wrong file can be undone.
 */
function restore(databasePath: string, backupFile: string, io: CliIo): number {
  if (!existsSync(backupFile)) {
    io.err(`No such file: ${backupFile}`)
    return EXIT_FAILED
  }
  if (!checkBackup(backupFile, io, true)) {
    io.err('Nothing was changed.')
    return EXIT_FAILED
  }

  if (existsSync(databasePath)) {
    // Opening and closing recovers a crashed database and, if nobody else has it open, removes
    // the -shm file. If -shm is still there afterwards, another process (Orbit) is using it.
    openDatabase(databasePath).close()
    if (existsSync(`${databasePath}-shm`)) {
      io.err('The database is in use. Stop Orbit first (docker compose stop orbit), then restore.')
      return EXIT_FAILED
    }
    const aside = `${databasePath}.before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`
    renameSync(databasePath, aside)
    for (const suffix of ['-wal', '-shm'])
      if (existsSync(databasePath + suffix)) renameSync(databasePath + suffix, aside + suffix)
    io.out(`The previous database was kept as ${aside}`)
  }
  mkdirSync(dirname(databasePath), { recursive: true })
  copyFileSync(backupFile, databasePath)
  chmodSync(databasePath, 0o600)
  io.out(`Restored ${backupFile}. Start Orbit again. Pending migrations run on start.`)
  return EXIT_OK
}

async function createUser(
  config: ReturnType<typeof loadConfig>,
  username: string,
  io: CliIo,
): Promise<number> {
  const password = await io.readPassword()
  const db = openDatabase(config.databasePath)
  try {
    // The operator is on the server, so the instance's registration policy does not apply.
    const services = createSqliteServices(db, { registration: 'open' })
    const user = await services.auth.register({ username, password })
    io.out(`Created ${user.displayName}. An owner can now add them to a household by username.`)
  } finally {
    db.close()
  }
  return EXIT_OK
}

async function resetPassword(
  config: ReturnType<typeof loadConfig>,
  username: string,
  io: CliIo,
): Promise<number> {
  const password = await io.readPassword()
  const db = openDatabase(config.databasePath)
  try {
    await createSqliteServices(db, config).auth.resetPassword({ username, password })
  } finally {
    db.close()
  }
  io.out(`Password changed for ${username}. They were signed out everywhere.`)
  return EXIT_OK
}
