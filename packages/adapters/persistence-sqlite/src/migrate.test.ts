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
      'feeds',
      'household_members',
      'households',
      'invitations',
      'list_items',
      'lists',
      'planet_state',
      'planet_webhooks',
      'scheduled_jobs',
      'schema_migrations',
      'secrets',
      'sessions',
      'users',
    ])
  })

  it('adds invitations to a version 2 database without touching existing data', () => {
    const db = openDatabase(':memory:')
    migrate(db, migrations.slice(0, 2))
    db.prepare("INSERT INTO users (id, display_name) VALUES ('u1', 'Alice')").run()
    db.prepare("INSERT INTO households (id, name) VALUES ('h1', 'Home')").run()
    db.prepare(
      "INSERT INTO household_members (household_id, user_id, role, position) VALUES ('h1', 'u1', 'owner', 0)",
    ).run()
    expect(tables(db)).not.toContain('invitations')

    expect(migrate(db)).toEqual([3, 4, 5, 6, 7])

    expect(tables(db)).toContain('invitations')
    expect(db.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({ n: 1 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM household_members').get()).toEqual({ n: 1 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM invitations').get()).toEqual({ n: 0 })
  })

  it('adds feeds to a version 3 database without touching invitations', () => {
    const db = openDatabase(':memory:')
    migrate(db, migrations.slice(0, 3))
    db.prepare(
      "INSERT INTO invitations (id, household_id, role, token_hash, created_by, created_at, expires_at) VALUES ('i1', 'h1', 'member', 'x', 'u1', 'now', 'later')",
    ).run()
    expect(tables(db)).not.toContain('feeds')

    expect(migrate(db)).toEqual([4, 5, 6, 7])

    expect(tables(db)).toContain('feeds')
    expect(db.prepare('SELECT COUNT(*) AS n FROM invitations').get()).toEqual({ n: 1 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM feeds').get()).toEqual({ n: 0 })
  })

  it('adds lists to a version 5 database and keeps its feeds', () => {
    const db = openDatabase(':memory:')
    migrate(db, migrations.slice(0, 5))
    db.prepare(
      "INSERT INTO feeds (id, household_id, name, fields, token_hash, created_by, created_at) VALUES ('f1', 'h1', 'Hall', '[\"household.name\"]', 'x', 'u1', 'now')",
    ).run()
    expect(tables(db)).not.toContain('lists')

    expect(migrate(db)).toEqual([6])

    expect(tables(db)).toContain('lists')
    expect(tables(db)).toContain('list_items')
    expect(db.prepare('SELECT list_id FROM feeds WHERE id = ?').get('f1')).toEqual({
      list_id: null,
    })
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
