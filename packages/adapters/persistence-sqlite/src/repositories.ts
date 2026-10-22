import type {
  AccountRepository,
  Credential,
  DashboardRepository,
  FeedRepository,
  HouseholdRepository,
  InvitationRepository,
  RegistrationOutcome,
  RegistrationPolicy,
  Session,
  SessionStore,
  UserRepository,
} from '@orbit/application'
import {
  DashboardId,
  FeedId,
  HouseholdId,
  InvitationId,
  UserId,
  Username,
  WidgetPlacementId,
  type Columns,
  type Dashboard,
  type Feed,
  type FeedField,
  type Household,
  type HouseholdRole,
  type Invitation,
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

export class SqliteAccountRepository implements AccountRepository {
  readonly #db: Database

  constructor(db: Database) {
    this.#db = db
  }

  async register(
    user: User,
    credential: Credential,
    policy: RegistrationPolicy,
  ): Promise<RegistrationOutcome> {
    // BEGIN IMMEDIATE takes the write lock first, so two registrations cannot both
    // see an empty instance or the same free username.
    return inTransaction(this.#db, (): RegistrationOutcome => {
      const existing = this.#db.prepare('SELECT COUNT(*) AS n FROM credentials').get() as Row
      if (policy === 'first-user-only' && Number(existing.n) > 0) return 'registration-closed'
      const taken = this.#db
        .prepare('SELECT 1 AS found FROM credentials WHERE username = ?')
        .get(credential.username)
      if (taken) return 'username-taken'
      this.#db
        .prepare('INSERT INTO users (id, display_name) VALUES (?, ?)')
        .run(user.id, user.displayName)
      this.#db
        .prepare('INSERT INTO credentials (user_id, username, password_hash) VALUES (?, ?, ?)')
        .run(credential.userId, credential.username, credential.passwordHash)
      return 'created'
    })
  }

  async setPasswordHash(userId: UserId, passwordHash: string): Promise<boolean> {
    const result = this.#db
      .prepare('UPDATE credentials SET password_hash = ? WHERE user_id = ?')
      .run(passwordHash, userId)
    return Number(result.changes) > 0
  }

  async findCredential(username: Username): Promise<Credential | undefined> {
    const row = this.#db
      .prepare('SELECT user_id, username, password_hash FROM credentials WHERE username = ?')
      .get(username) as Row | undefined
    return (
      row && {
        userId: UserId(String(row.user_id)),
        username: Username(String(row.username)),
        passwordHash: String(row.password_hash),
      }
    )
  }
}

export class SqliteSessionStore implements SessionStore {
  readonly #db: Database

  constructor(db: Database) {
    this.#db = db
  }

  async create(session: Session): Promise<void> {
    this.#db
      .prepare(
        'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
      )
      .run(
        session.tokenHash,
        session.userId,
        session.createdAt.toISOString(),
        session.expiresAt.toISOString(),
      )
  }

  async get(tokenHash: string): Promise<Session | undefined> {
    const row = this.#db
      .prepare(
        'SELECT token_hash, user_id, created_at, expires_at FROM sessions WHERE token_hash = ?',
      )
      .get(tokenHash) as Row | undefined
    return (
      row && {
        tokenHash: String(row.token_hash),
        userId: UserId(String(row.user_id)),
        createdAt: new Date(String(row.created_at)),
        expiresAt: new Date(String(row.expires_at)),
      }
    )
  }

  async delete(tokenHash: string): Promise<void> {
    this.#db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash)
  }

  async deleteForUser(userId: UserId): Promise<number> {
    const result = this.#db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
    return Number(result.changes)
  }

  async deleteExpired(now: Date): Promise<number> {
    const result = this.#db
      .prepare('DELETE FROM sessions WHERE expires_at <= ?')
      .run(now.toISOString())
    return Number(result.changes)
  }
}

export class SqliteInvitationRepository implements InvitationRepository {
  readonly #db: Database

  constructor(db: Database) {
    this.#db = db
  }

  async create(invitation: Invitation): Promise<void> {
    this.#db
      .prepare(
        `INSERT INTO invitations
           (id, household_id, role, token_hash, created_by, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        invitation.id,
        invitation.householdId,
        invitation.role,
        invitation.tokenHash,
        invitation.createdBy,
        invitation.createdAt.toISOString(),
        invitation.expiresAt.toISOString(),
      )
  }

  async get(id: InvitationId): Promise<Invitation | undefined> {
    const row = this.#db.prepare(`${SELECT_INVITATION} WHERE id = ?`).get(id) as Row | undefined
    return row && hydrateInvitation(row)
  }

  async findByTokenHash(tokenHash: string): Promise<Invitation | undefined> {
    const row = this.#db.prepare(`${SELECT_INVITATION} WHERE token_hash = ?`).get(tokenHash) as
      Row | undefined
    return row && hydrateInvitation(row)
  }

  async listForHousehold(householdId: HouseholdId): Promise<Invitation[]> {
    const rows = this.#db
      .prepare(`${SELECT_INVITATION} WHERE household_id = ? ORDER BY rowid`)
      .all(householdId) as Row[]
    return rows.map(hydrateInvitation)
  }

  // The conditions live in the UPDATE itself, so the check and the change are one statement
  // and two simultaneous claims cannot both succeed.
  async claim(id: InvitationId, userId: UserId, now: Date): Promise<boolean> {
    const at = now.toISOString()
    const result = this.#db
      .prepare(
        `UPDATE invitations SET accepted_by = ?, accepted_at = ?
         WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
      )
      .run(userId, at, id, at)
    return Number(result.changes) > 0
  }

  async release(id: InvitationId, userId: UserId): Promise<void> {
    this.#db
      .prepare(
        'UPDATE invitations SET accepted_by = NULL, accepted_at = NULL WHERE id = ? AND accepted_by = ?',
      )
      .run(id, userId)
  }

  async revoke(id: InvitationId, now: Date): Promise<boolean> {
    const result = this.#db
      .prepare(
        'UPDATE invitations SET revoked_at = ? WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL',
      )
      .run(now.toISOString(), id)
    return Number(result.changes) > 0
  }
}

const SELECT_INVITATION = `SELECT id, household_id, role, token_hash, created_by, created_at,
  expires_at, accepted_by, accepted_at, revoked_at FROM invitations`

function hydrateInvitation(row: Row): Invitation {
  return {
    id: InvitationId(String(row.id)),
    householdId: HouseholdId(String(row.household_id)),
    role: row.role as HouseholdRole,
    tokenHash: String(row.token_hash),
    createdBy: UserId(String(row.created_by)),
    createdAt: new Date(String(row.created_at)),
    expiresAt: new Date(String(row.expires_at)),
    ...(row.accepted_by === null ? {} : { acceptedBy: UserId(String(row.accepted_by)) }),
    ...(row.accepted_at === null ? {} : { acceptedAt: new Date(String(row.accepted_at)) }),
    ...(row.revoked_at === null ? {} : { revokedAt: new Date(String(row.revoked_at)) }),
  }
}

export class SqliteFeedRepository implements FeedRepository {
  readonly #db: Database

  constructor(db: Database) {
    this.#db = db
  }

  async create(feed: Feed): Promise<void> {
    this.#db
      .prepare(
        `INSERT INTO feeds
           (id, household_id, name, fields, dashboard_id, token_hash, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        feed.id,
        feed.householdId,
        feed.name,
        JSON.stringify(feed.fields),
        feed.dashboardId ?? null,
        feed.tokenHash,
        feed.createdBy,
        feed.createdAt.toISOString(),
      )
  }

  async get(id: FeedId): Promise<Feed | undefined> {
    const row = this.#db.prepare(`${SELECT_FEED} WHERE id = ?`).get(id) as Row | undefined
    return row && hydrateFeed(row)
  }

  async findByTokenHash(tokenHash: string): Promise<Feed | undefined> {
    const row = this.#db.prepare(`${SELECT_FEED} WHERE token_hash = ?`).get(tokenHash) as
      Row | undefined
    return row && hydrateFeed(row)
  }

  async listForHousehold(householdId: HouseholdId): Promise<Feed[]> {
    const rows = this.#db
      .prepare(`${SELECT_FEED} WHERE household_id = ? ORDER BY rowid`)
      .all(householdId) as Row[]
    return rows.map(hydrateFeed)
  }

  async revoke(id: FeedId, now: Date): Promise<boolean> {
    const result = this.#db
      .prepare('UPDATE feeds SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
      .run(now.toISOString(), id)
    return Number(result.changes) > 0
  }
}

const SELECT_FEED = `SELECT id, household_id, name, fields, dashboard_id, token_hash, created_by,
  created_at, revoked_at FROM feeds`

function hydrateFeed(row: Row): Feed {
  return {
    id: FeedId(String(row.id)),
    householdId: HouseholdId(String(row.household_id)),
    name: String(row.name),
    fields: JSON.parse(String(row.fields)) as FeedField[],
    ...(row.dashboard_id === null ? {} : { dashboardId: DashboardId(String(row.dashboard_id)) }),
    tokenHash: String(row.token_hash),
    createdBy: UserId(String(row.created_by)),
    createdAt: new Date(String(row.created_at)),
    ...(row.revoked_at === null ? {} : { revokedAt: new Date(String(row.revoked_at)) }),
  }
}
