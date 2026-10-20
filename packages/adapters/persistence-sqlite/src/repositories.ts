import type { DashboardRepository, HouseholdRepository, UserRepository } from '@orbit/application'
import {
  DashboardId,
  HouseholdId,
  UserId,
  WidgetPlacementId,
  type Columns,
  type Dashboard,
  type Household,
  type HouseholdRole,
  type JsonObject,
  type User,
  type WidgetPlacement,
} from '@orbit/domain'
import { inTransaction, type Database } from './database.ts'

type Row = Record<string, string | number | null>

export class SqliteUserRepository implements UserRepository {
  readonly #db: Database

  constructor(db: Database) {
    this.#db = db
  }

  async get(id: UserId): Promise<User | undefined> {
    const row = this.#db.prepare('SELECT id, display_name FROM users WHERE id = ?').get(id) as
      Row | undefined
    return row && { id: UserId(String(row.id)), displayName: String(row.display_name) }
  }

  async save(user: User): Promise<void> {
    this.#db
      .prepare(
        `INSERT INTO users (id, display_name) VALUES (?, ?)
         ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name`,
      )
      .run(user.id, user.displayName)
  }
}

export class SqliteHouseholdRepository implements HouseholdRepository {
  readonly #db: Database

  constructor(db: Database) {
    this.#db = db
  }

  async get(id: HouseholdId): Promise<Household | undefined> {
    const row = this.#db.prepare('SELECT id, name FROM households WHERE id = ?').get(id) as
      Row | undefined
    return row && this.#hydrate(row)
  }

  async save(household: Household): Promise<void> {
    inTransaction(this.#db, () => {
      this.#db
        .prepare(
          `INSERT INTO households (id, name) VALUES (?, ?)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
        )
        .run(household.id, household.name)
      this.#db.prepare('DELETE FROM household_members WHERE household_id = ?').run(household.id)
      const insert = this.#db.prepare(
        'INSERT INTO household_members (household_id, user_id, role, position) VALUES (?, ?, ?, ?)',
      )
      household.members.forEach((m, i) => insert.run(household.id, m.userId, m.role, i))
    })
  }

  async listForUser(userId: UserId): Promise<Household[]> {
    const rows = this.#db
      .prepare(
        `SELECT h.id, h.name FROM households h
         WHERE h.id IN (SELECT household_id FROM household_members WHERE user_id = ?)
         ORDER BY h.rowid`,
      )
      .all(userId) as Row[]
    return rows.map((row) => this.#hydrate(row))
  }

  #hydrate(row: Row): Household {
    const members = this.#db
      .prepare(
        'SELECT user_id, role FROM household_members WHERE household_id = ? ORDER BY position',
      )
      .all(String(row.id)) as Row[]
    return {
      id: HouseholdId(String(row.id)),
      name: String(row.name),
      members: members.map((m) => ({
        userId: UserId(String(m.user_id)),
        role: m.role as HouseholdRole,
      })),
    }
  }
}

export class SqliteDashboardRepository implements DashboardRepository {
  readonly #db: Database

  constructor(db: Database) {
    this.#db = db
  }

  async get(id: DashboardId): Promise<Dashboard | undefined> {
    const row = this.#db
      .prepare('SELECT id, household_id, name, columns FROM dashboards WHERE id = ?')
      .get(id) as Row | undefined
    return row && this.#hydrate(row)
  }

  async save(dashboard: Dashboard): Promise<void> {
    inTransaction(this.#db, () => {
      this.#db
        .prepare(
          `INSERT INTO dashboards (id, household_id, name, columns) VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             household_id = excluded.household_id,
             name = excluded.name,
             columns = excluded.columns`,
        )
        .run(dashboard.id, dashboard.householdId, dashboard.name, dashboard.columns)
      this.#db.prepare('DELETE FROM dashboard_widgets WHERE dashboard_id = ?').run(dashboard.id)
      const insert = this.#db.prepare(
        `INSERT INTO dashboard_widgets (id, dashboard_id, position, type, span, config)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      dashboard.widgets.forEach((w, i) =>
        insert.run(w.id, dashboard.id, i, w.type, w.span, JSON.stringify(w.config)),
      )
    })
  }

  async listForHousehold(householdId: HouseholdId): Promise<Dashboard[]> {
    const rows = this.#db
      .prepare(
        'SELECT id, household_id, name, columns FROM dashboards WHERE household_id = ? ORDER BY rowid',
      )
      .all(householdId) as Row[]
    return rows.map((row) => this.#hydrate(row))
  }

  async delete(id: DashboardId): Promise<void> {
    this.#db.prepare('DELETE FROM dashboards WHERE id = ?').run(id)
  }

  #hydrate(row: Row): Dashboard {
    const widgets = this.#db
      .prepare(
        'SELECT id, type, span, config FROM dashboard_widgets WHERE dashboard_id = ? ORDER BY position',
      )
      .all(String(row.id)) as Row[]
    return {
      id: DashboardId(String(row.id)),
      householdId: HouseholdId(String(row.household_id)),
      name: String(row.name),
      columns: Number(row.columns) as Columns,
      widgets: widgets.map((w): WidgetPlacement => ({
        id: WidgetPlacementId(String(w.id)),
        type: String(w.type),
        span: Number(w.span),
        config: JSON.parse(String(w.config)) as JsonObject,
      })),
    }
  }
}
