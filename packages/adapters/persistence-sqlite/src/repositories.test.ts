import {
  DashboardId,
  HouseholdId,
  UserId,
  WidgetPlacementId,
  addMember,
  addWidget,
  createDashboard,
  createHousehold,
} from '@orbit/domain'
import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Database } from './database.ts'
import { migrate } from './migrate.ts'
import { SqliteDashboardRepository, SqliteHouseholdRepository } from './repositories.ts'

const count = (db: Database, table: string) =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n

describe('sqlite repositories', () => {
  let db: Database
  let households: SqliteHouseholdRepository
  let dashboards: SqliteDashboardRepository

  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db)
    households = new SqliteHouseholdRepository(db)
    dashboards = new SqliteDashboardRepository(db)
  })

  it('stores hostile strings literally instead of interpreting them as SQL', async () => {
    const evil = `x'); DROP TABLE households; --`
    const h = createHousehold({ id: HouseholdId(evil), name: evil, ownerId: UserId(evil) })
    await households.save(h)
    expect(await households.get(h.id)).toEqual(h)
    expect(count(db, 'households')).toBe(1)
  })

  it('removes every placement of a widget type and keeps the rest in order', async () => {
    const make = (id: string, types: string[]) => {
      let d = createDashboard({ id: DashboardId(id), householdId: HouseholdId('h'), name: id })
      types.forEach((type, i) => {
        d = addWidget(d, { id: WidgetPlacementId(`${id}-${i}`), type, config: {} })
      })
      return d
    }
    await dashboards.save(make('a', ['notes.quick', 'planet.dev.x', 'clock.now', 'planet.dev.x']))
    await dashboards.save(make('b', ['planet.dev.y', 'planet.dev.x']))
    await dashboards.save(make('c', ['clock.now']))

    expect(dashboards.removeWidgetsOfType('planet.dev.x')).toBe(3)
    expect((await dashboards.get(DashboardId('a')))?.widgets.map((w) => w.id)).toEqual([
      'a-0',
      'a-2',
    ])
    expect((await dashboards.get(DashboardId('b')))?.widgets.map((w) => w.id)).toEqual(['b-0'])
    expect((await dashboards.get(DashboardId('c')))?.widgets).toHaveLength(1)
    const positions = db
      .prepare('SELECT position FROM dashboard_widgets WHERE dashboard_id = ? ORDER BY position')
      .all('a') as { position: number }[]
    expect(positions.map((p) => p.position)).toEqual([0, 1])
    expect(dashboards.removeWidgetsOfType('planet.dev.x')).toBe(0)
  })

  it('round-trips unicode and awkward JSON in widget config', async () => {
    let d = createDashboard({
      id: DashboardId('d'),
      householdId: HouseholdId('h'),
      name: 'Uge æøå',
    })
    d = addWidget(d, {
      id: WidgetPlacementId('w'),
      type: 'notes.quick',
      config: { text: 'Køb brød 🍞\n"quoted" \\ back', n: 0, empty: '', arr: [] },
    })
    await dashboards.save(d)
    expect(await dashboards.get(d.id)).toEqual(d)
  })

  it('removes widgets that are no longer on the dashboard when saved again', async () => {
    let d = createDashboard({ id: DashboardId('d'), householdId: HouseholdId('h'), name: 'D' })
    d = addWidget(d, { id: WidgetPlacementId('a'), type: 'calendar.agenda' })
    d = addWidget(d, { id: WidgetPlacementId('b'), type: 'lists.shopping' })
    await dashboards.save(d)
    await dashboards.save({ ...d, widgets: [d.widgets[1]!] })
    expect(count(db, 'dashboard_widgets')).toBe(1)
  })

  it('deletes widgets together with their dashboard', async () => {
    let d = createDashboard({ id: DashboardId('d'), householdId: HouseholdId('h'), name: 'D' })
    d = addWidget(d, { id: WidgetPlacementId('a'), type: 'calendar.agenda' })
    await dashboards.save(d)
    await dashboards.delete(d.id)
    expect(count(db, 'dashboard_widgets')).toBe(0)
  })

  it('keeps member order and removes dropped members on save', async () => {
    const owner = UserId('o')
    let h = createHousehold({ id: HouseholdId('h'), name: 'H', ownerId: owner })
    h = addMember(addMember(h, UserId('z')), UserId('a'))
    await households.save(h)
    expect((await households.get(h.id))?.members.map((m) => m.userId)).toEqual(['o', 'z', 'a'])
    await households.save({ ...h, members: h.members.slice(0, 2) })
    expect(count(db, 'household_members')).toBe(2)
  })

  it('does not leave a half-saved dashboard when a widget insert fails', async () => {
    let d = createDashboard({ id: DashboardId('d'), householdId: HouseholdId('h'), name: 'Before' })
    d = addWidget(d, { id: WidgetPlacementId('a'), type: 'calendar.agenda' })
    await dashboards.save(d)
    // A widget id already used by another dashboard violates the primary key mid-save.
    const other = addWidget(
      createDashboard({ id: DashboardId('d2'), householdId: HouseholdId('h'), name: 'Other' }),
      { id: WidgetPlacementId('taken'), type: 'lists.shopping' },
    )
    await dashboards.save(other)
    const clash = {
      ...d,
      name: 'After',
      widgets: [{ ...d.widgets[0]!, id: WidgetPlacementId('taken') }],
    }
    await expect(dashboards.save(clash)).rejects.toThrow()
    expect(await dashboards.get(d.id)).toEqual(d)
  })

  it('enforces foreign keys inside the dashboard aggregate', () => {
    expect(() =>
      db
        .prepare(
          "INSERT INTO dashboard_widgets (id, dashboard_id, position, type, span, config) VALUES ('w','nope',0,'a.b',1,'{}')",
        )
        .run(),
    ).toThrow(/FOREIGN KEY/)
  })
})
