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
      'credentials',
      'dashboard_widgets',
      'dashboards',
      'household_members',
      'households',
      'schema_migrations',
      'sessions',
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
    migrate(db, migrations.slice(0, 1))
    expect(migrate(db)).toEqual(migrations.slice(1).map((m) => m.version))
  })

  it('rolls back a failing migration and leaves the version untouched', () => {
    const db = openDatabase(':memory:')
    migrate(db)
    const broken = {
      version: migrations.length + 1,
      name: 'broken',
      sql: 'CREATE TABLE half_done (id TEXT) STRICT; THIS IS NOT SQL;',
    }
    expect(() => migrate(db, [...migrations, broken])).toThrow()
    expect(tables(db)).not.toContain('half_done')
    expect(migrate(db, migrations)).toEqual([])
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
