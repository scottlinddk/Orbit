import { describe, expect, it } from 'vitest'
import { openDatabase } from './database.ts'
import { migrate } from './migrate.ts'
import { migrations } from './migrations.ts'

const tables = (db: ReturnType<typeof openDatabase>) =>
  (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]
  )
    .map((r) => r.name)
    .sort()

describe('migrate', () => {
  it('builds the full schema from an empty database', () => {
    const db = openDatabase(':memory:')
    expect(migrate(db)).toEqual(migrations.map((m) => m.version))
    expect(tables(db)).toEqual([
      'dashboard_widgets',
      'dashboards',
      'household_members',
      'households',
      'schema_migrations',
      'users',
    ])
  })

  it('is idempotent', () => {
    const db = openDatabase(':memory:')
    migrate(db)
    expect(migrate(db)).toEqual([])
  })

  it('applies only the migrations that are pending', () => {
    const db = openDatabase(':memory:')
    const [first] = migrations
    migrate(db, [first!])
    const next = {
      version: 2,
      name: 'extra',
      sql: 'CREATE TABLE extra (id TEXT PRIMARY KEY) STRICT',
    }
    expect(migrate(db, [first!, next])).toEqual([2])
    expect(tables(db)).toContain('extra')
  })

  it('rolls back a failing migration and leaves the version untouched', () => {
    const db = openDatabase(':memory:')
    const [first] = migrations
    migrate(db, [first!])
    const broken = {
      version: 2,
      name: 'broken',
      sql: 'CREATE TABLE half_done (id TEXT) STRICT; THIS IS NOT SQL;',
    }
    expect(() => migrate(db, [first!, broken])).toThrow()
    expect(tables(db)).not.toContain('half_done')
    expect(migrate(db, [first!])).toEqual([])
  })

  it('refuses a database written by a newer Orbit', () => {
    const db = openDatabase(':memory:')
    migrate(db)
    db.prepare("INSERT INTO schema_migrations VALUES (999, 'future', 'now')").run()
    expect(() => migrate(db)).toThrow(/newer|only knows up to/)
  })

  it('rejects gaps in migration numbering', () => {
    const db = openDatabase(':memory:')
    expect(() => migrate(db, [{ version: 2, name: 'x', sql: 'SELECT 1' }])).toThrow(/1\.\.n/)
  })
})
