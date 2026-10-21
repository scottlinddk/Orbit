import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from './database.ts'
import { migrate } from './migrate.ts'
import { migrations } from './migrations.ts'
import { snapshotBeforeMigration } from './pre-migration-snapshot.ts'
import { verifyDatabase } from './verify.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'orbit-snap-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const at = (iso: string) => () => new Date(iso)
const options = (extra: object = {}) => ({ directory: join(dir, 'backups'), keep: 5, ...extra })
const previous = migrations.slice(0, -1)

/** A database one migration behind, with a row to prove the snapshot holds real data. */
function olderDatabase() {
  const db = openDatabase(join(dir, 'orbit.sqlite'))
  migrate(db, previous)
  db.prepare('INSERT INTO users (id, display_name) VALUES (?, ?)').run('u1', 'Alice')
  return db
}

describe('snapshotBeforeMigration', () => {
  it('writes a verifiable snapshot of schema N-1 before the migration runs', async () => {
    const db = olderDatabase()
    const file = await snapshotBeforeMigration(db, options({ now: at('2026-01-02T03:04:05.000Z') }))

    const schema = previous.length
    expect(file).toBe(
      join(dir, 'backups', `pre-migration-${schema}-2026-01-02T03-04-05-000Z.sqlite`),
    )
    expect(statSync(file as string).mode & 0o777).toBe(0o600)
    const snapshot = openDatabase(file as string, { readOnly: true })
    expect(verifyDatabase(snapshot)).toMatchObject({ schemaVersion: schema, counts: { users: 1 } })
    // The live database has not been migrated by the snapshot step.
    expect(migrate(db)).toEqual([migrations.length])
  })

  it('does nothing for a new database', async () => {
    const db = openDatabase(':memory:')
    expect(await snapshotBeforeMigration(db, options())).toBeUndefined()
    expect(existsSync(join(dir, 'backups'))).toBe(false)
  })

  it('does nothing when no migration is pending', async () => {
    const db = openDatabase(join(dir, 'orbit.sqlite'))
    migrate(db)
    expect(await snapshotBeforeMigration(db, options())).toBeUndefined()
    expect(existsSync(join(dir, 'backups'))).toBe(false)
  })

  it('throws when the snapshot cannot be written, so the caller does not migrate', async () => {
    const db = olderDatabase()
    // A file where the folder should be.
    writeFileSync(join(dir, 'backups'), 'not a folder')
    await expect(snapshotBeforeMigration(db, options())).rejects.toThrow()
    const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number }
    expect(row.v).toBe(previous.length)
  })

  it('keeps only the newest N snapshots', async () => {
    const db = olderDatabase()
    for (const day of ['01', '02', '03', '04']) {
      await snapshotBeforeMigration(
        db,
        options({ keep: 2, now: at(`2026-01-${day}T00:00:00.000Z`) }),
      )
    }
    expect(readdirSync(join(dir, 'backups')).sort()).toEqual([
      `pre-migration-${previous.length}-2026-01-03T00-00-00-000Z.sqlite`,
      `pre-migration-${previous.length}-2026-01-04T00-00-00-000Z.sqlite`,
    ])
  })

  it('leaves other files in the folder alone', async () => {
    const db = olderDatabase()
    const other = join(dir, 'backups', 'orbit-manual.sqlite')
    await snapshotBeforeMigration(db, options({ now: at('2026-01-01T00:00:00.000Z') }))
    writeFileSync(other, 'mine')
    await snapshotBeforeMigration(db, options({ keep: 1, now: at('2026-01-02T00:00:00.000Z') }))
    expect(existsSync(other)).toBe(true)
  })
})
