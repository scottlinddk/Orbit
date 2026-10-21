import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from './database.ts'
import { migrate } from './migrate.ts'
import { runScheduledBackupIfDue } from './scheduled-backup.ts'
import { verifyDatabase } from './verify.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'orbit-sched-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const HOUR = 60 * 60 * 1000
const at = (iso: string) => () => new Date(iso)
const options = (extra: object = {}) => ({
  directory: join(dir, 'backups'),
  keep: 3,
  intervalMs: 24 * HOUR,
  ...extra,
})
const names = () => readdirSync(join(dir, 'backups')).sort()

function database() {
  const db = openDatabase(join(dir, 'orbit.sqlite'))
  migrate(db)
  db.prepare('INSERT INTO users (id, display_name) VALUES (?, ?)').run('u1', 'Alice')
  return db
}

describe('runScheduledBackupIfDue', () => {
  it('writes a private, verifiable backup when none exists', async () => {
    const db = database()
    const file = await runScheduledBackupIfDue(db, options({ now: at('2026-01-02T03:04:05.000Z') }))

    expect(file).toBe(join(dir, 'backups', 'scheduled-2026-01-02T03-04-05-000Z.sqlite'))
    expect(statSync(file as string).mode & 0o777).toBe(0o600)
    const copy = openDatabase(file as string, { readOnly: true })
    expect(verifyDatabase(copy)).toMatchObject({ counts: { users: 1 } })
    copy.close()
    expect(names()).toEqual(['scheduled-2026-01-02T03-04-05-000Z.sqlite'])
  })

  it('does nothing until the newest backup is a full interval old', async () => {
    const db = database()
    await runScheduledBackupIfDue(db, options({ now: at('2026-01-02T00:00:00.000Z') }))

    const early = await runScheduledBackupIfDue(
      db,
      options({ now: at('2026-01-02T23:59:59.000Z') }),
    )
    expect(early).toBeUndefined()
    const due = await runScheduledBackupIfDue(db, options({ now: at('2026-01-03T00:00:00.000Z') }))
    expect(due).toBeDefined()
    expect(names()).toHaveLength(2)
  })

  it('catches up after the server was off for days, with one backup', async () => {
    const db = database()
    await runScheduledBackupIfDue(db, options({ now: at('2026-01-02T00:00:00.000Z') }))
    await runScheduledBackupIfDue(db, options({ now: at('2026-01-09T00:00:00.000Z') }))
    expect(names()).toHaveLength(2)
  })

  it('keeps only the newest backups', async () => {
    const db = database()
    for (const day of ['02', '03', '04', '05', '06']) {
      await runScheduledBackupIfDue(db, options({ now: at(`2026-01-${day}T00:00:00.000Z`) }))
    }
    expect(names()).toEqual([
      'scheduled-2026-01-04T00-00-00-000Z.sqlite',
      'scheduled-2026-01-05T00-00-00-000Z.sqlite',
      'scheduled-2026-01-06T00-00-00-000Z.sqlite',
    ])
  })

  it('leaves manual and pre-migration files alone', async () => {
    const db = database()
    const backups = join(dir, 'backups')
    await runScheduledBackupIfDue(db, options({ now: at('2026-01-01T00:00:00.000Z'), keep: 1 }))
    writeFileSync(join(backups, 'pre-migration-2-2026-01-01T00-00-00-000Z.sqlite'), 'x')
    writeFileSync(join(backups, 'orbit-2026-01-01.sqlite'), 'x')
    await runScheduledBackupIfDue(db, options({ now: at('2026-01-05T00:00:00.000Z'), keep: 1 }))
    expect(names()).toEqual([
      'orbit-2026-01-01.sqlite',
      'pre-migration-2-2026-01-01T00-00-00-000Z.sqlite',
      'scheduled-2026-01-05T00-00-00-000Z.sqlite',
    ])
  })

  it('removes a partial file left by an interrupted run and does not count it', async () => {
    const db = database()
    const backups = join(dir, 'backups')
    await runScheduledBackupIfDue(db, options({ now: at('2026-01-01T00:00:00.000Z') }))
    writeFileSync(join(backups, 'scheduled-2026-01-01T12-00-00-000Z.partial'), 'half')
    const file = await runScheduledBackupIfDue(db, options({ now: at('2026-01-02T00:00:00.000Z') }))
    expect(file).toBeDefined()
    expect(names().some((n) => n.endsWith('.partial'))).toBe(false)
  })

  it('leaves nothing behind when the backup fails', async () => {
    const db = database()
    db.close()
    await expect(
      runScheduledBackupIfDue(db, options({ now: at('2026-01-02T00:00:00.000Z') })),
    ).rejects.toThrow()
    expect(existsSync(join(dir, 'backups')) ? names() : []).toEqual([])
  })
})
