import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { backupDatabase } from './backup.ts'
import { openDatabase } from './database.ts'
import { migrate } from './migrate.ts'
import { migrations } from './migrations.ts'
import { verifyDatabase } from './verify.ts'

describe('verifyDatabase', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'orbit-verify-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const seeded = async () => {
    const live = openDatabase(join(dir, 'live.sqlite'))
    migrate(live)
    live.exec(
      "INSERT INTO users VALUES ('u1', 'Alice'); INSERT INTO households VALUES ('h1', 'Home')",
    )
    const target = join(dir, 'backup.sqlite')
    await backupDatabase(live, target)
    live.close()
    return target
  }

  it('accepts a healthy backup and reports what is in it', async () => {
    const report = verifyDatabase(openDatabase(await seeded(), { readOnly: true }))
    expect(report).toMatchObject({
      ok: true,
      schemaVersion: migrations.length,
      latestKnownVersion: migrations.length,
      counts: { users: 1, households: 1, dashboards: 0 },
      problems: [],
    })
  })

  it('opens read-only: the file is not modified', async () => {
    const path = await seeded()
    const db = openDatabase(path, { readOnly: true })
    expect(() => db.exec("INSERT INTO users VALUES ('u2', 'Bob')")).toThrow(/readonly/i)
    db.close()
  })

  it('rejects a database from a newer Orbit', async () => {
    const path = await seeded()
    const db = openDatabase(path)
    db.exec("INSERT INTO schema_migrations VALUES (999, 'future', 'now')")
    const report = verifyDatabase(db)
    expect(report.ok).toBe(false)
    expect(report.problems.join()).toMatch(/newer than this Orbit/)
  })

  it('rejects an SQLite file that is not an Orbit database', () => {
    const db = openDatabase(join(dir, 'other.sqlite'))
    db.exec('CREATE TABLE unrelated (x)')
    const report = verifyDatabase(db)
    expect(report.ok).toBe(false)
    expect(report.problems.join()).toMatch(/not an Orbit database/)
  })

  it('rejects a file that is not a database at all', () => {
    const path = join(dir, 'garbage.sqlite')
    writeFileSync(path, 'this is definitely not sqlite '.repeat(100))
    expect(() => verifyDatabase(openDatabase(path, { readOnly: true }))).toThrow()
  })

  it('rejects a corrupted database', async () => {
    const path = await seeded()
    const bytes = (await import('node:fs')).readFileSync(path)
    // Overwrite the b-tree header and cells of page 1, which holds the schema.
    bytes.fill(0xff, 100, 400)
    writeFileSync(path, bytes)
    let ok = true
    try {
      ok = verifyDatabase(openDatabase(path, { readOnly: true })).ok
    } catch {
      ok = false
    }
    expect(ok).toBe(false)
  })
})
