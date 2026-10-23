import type {
  DeliveryLogRepository,
  NotificationDedupeRepository,
  NotificationEndpointRepository,
} from '@orbit/application'
import {
  HouseholdId,
  NotificationEndpointId,
  UserId,
  type DeliveredEvent,
  type DeliveryLogEntry,
  type DeliveryOutcome,
  type NotificationEndpoint,
  type NotificationEvent,
} from '@orbit/domain'
import type { Database } from './database.ts'

type Row = Record<string, string | number | null>

const SELECT_ENDPOINT = `SELECT id, household_id, name, host, events, lead_minutes, enabled,
  disabled_reason, failures, created_by, created_at FROM notification_endpoints`

function hydrateEndpoint(row: Row): NotificationEndpoint {
  return {
    id: NotificationEndpointId(String(row.id)),
    householdId: HouseholdId(String(row.household_id)),
    name: String(row.name),
    host: String(row.host),
    events: JSON.parse(String(row.events)) as NotificationEvent[],
    leadMinutes: Number(row.lead_minutes),
    enabled: row.enabled === 1,
    ...(row.disabled_reason === null ? {} : { disabledReason: String(row.disabled_reason) }),
    failures: Number(row.failures),
    createdBy: UserId(String(row.created_by)),
    createdAt: new Date(String(row.created_at)),
  }
}

export class SqliteNotificationEndpointRepository implements NotificationEndpointRepository {
  readonly #db: Database

  constructor(db: Database) {
    this.#db = db
  }

  async create(endpoint: NotificationEndpoint): Promise<void> {
    this.#db
      .prepare(
        `INSERT INTO notification_endpoints
           (id, household_id, name, host, events, lead_minutes, enabled, disabled_reason,
            failures, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        endpoint.id,
        endpoint.householdId,
        endpoint.name,
        endpoint.host,
        JSON.stringify(endpoint.events),
        endpoint.leadMinutes,
        endpoint.enabled ? 1 : 0,
        endpoint.disabledReason ?? null,
        endpoint.failures,
        endpoint.createdBy,
        endpoint.createdAt.toISOString(),
      )
  }

  async get(id: NotificationEndpointId): Promise<NotificationEndpoint | undefined> {
    const row = this.#db.prepare(`${SELECT_ENDPOINT} WHERE id = ?`).get(id) as Row | undefined
    return row && hydrateEndpoint(row)
  }

  async listForHousehold(householdId: HouseholdId): Promise<NotificationEndpoint[]> {
    const rows = this.#db
      .prepare(`${SELECT_ENDPOINT} WHERE household_id = ? ORDER BY rowid`)
      .all(householdId) as Row[]
    return rows.map(hydrateEndpoint)
  }

  async save(endpoint: NotificationEndpoint): Promise<void> {
    this.#db
      .prepare(
        `UPDATE notification_endpoints
         SET name = ?, events = ?, lead_minutes = ?, enabled = ?, disabled_reason = ?, failures = ?
         WHERE id = ?`,
      )
      .run(
        endpoint.name,
        JSON.stringify(endpoint.events),
        endpoint.leadMinutes,
        endpoint.enabled ? 1 : 0,
        endpoint.disabledReason ?? null,
        endpoint.failures,
        endpoint.id,
      )
  }

  async delete(id: NotificationEndpointId): Promise<void> {
    this.#db.prepare('DELETE FROM notification_endpoints WHERE id = ?').run(id)
  }

  async listEnabledFor(event: NotificationEvent): Promise<NotificationEndpoint[]> {
    const rows = this.#db
      .prepare(
        `${SELECT_ENDPOINT}
         WHERE enabled = 1 AND EXISTS (SELECT 1 FROM json_each(events) WHERE value = ?)
         ORDER BY rowid`,
      )
      .all(event) as Row[]
    return rows.map(hydrateEndpoint)
  }
}

export class SqliteDeliveryLogRepository implements DeliveryLogRepository {
  readonly #db: Database

  constructor(db: Database) {
    this.#db = db
  }

  async append(entry: DeliveryLogEntry, keep: number): Promise<void> {
    this.#db
      .prepare(
        `INSERT INTO notification_deliveries
           (endpoint_id, delivery_id, event, at, attempt, outcome, http_status, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.endpointId,
        entry.deliveryId,
        entry.event,
        entry.at.toISOString(),
        entry.attempt,
        entry.outcome,
        entry.httpStatus ?? null,
        entry.error ?? null,
      )
    this.#db
      .prepare(
        `DELETE FROM notification_deliveries
         WHERE endpoint_id = ? AND rowid NOT IN (
           SELECT rowid FROM notification_deliveries WHERE endpoint_id = ?
           ORDER BY rowid DESC LIMIT ?
         )`,
      )
      .run(entry.endpointId, entry.endpointId, keep)
  }

  async recent(endpointId: NotificationEndpointId, limit: number): Promise<DeliveryLogEntry[]> {
    const rows = this.#db
      .prepare(
        `SELECT endpoint_id, delivery_id, event, at, attempt, outcome, http_status, error
         FROM notification_deliveries WHERE endpoint_id = ? ORDER BY rowid DESC LIMIT ?`,
      )
      .all(endpointId, limit) as Row[]
    return rows.map((row) => ({
      endpointId: NotificationEndpointId(String(row.endpoint_id)),
      deliveryId: String(row.delivery_id),
      event: String(row.event) as DeliveredEvent,
      at: new Date(String(row.at)),
      attempt: Number(row.attempt),
      outcome: String(row.outcome) as DeliveryOutcome,
      ...(row.http_status === null ? {} : { httpStatus: Number(row.http_status) }),
      ...(row.error === null ? {} : { error: String(row.error) }),
    }))
  }

  async deleteForEndpoint(endpointId: NotificationEndpointId): Promise<void> {
    this.#db.prepare('DELETE FROM notification_deliveries WHERE endpoint_id = ?').run(endpointId)
  }
}

export class SqliteNotificationDedupeRepository implements NotificationDedupeRepository {
  readonly #db: Database

  constructor(db: Database) {
    this.#db = db
  }

  async claim(key: string, relevantUntil: Date): Promise<boolean> {
    const result = this.#db
      .prepare('INSERT OR IGNORE INTO notification_dedupe (key, relevant_until) VALUES (?, ?)')
      .run(key, relevantUntil.toISOString())
    return Number(result.changes) === 1
  }

  async prune(before: Date): Promise<void> {
    this.#db
      .prepare('DELETE FROM notification_dedupe WHERE relevant_until < ?')
      .run(before.toISOString())
  }

  async deleteWithPrefix(prefix: string): Promise<void> {
    // substr instead of LIKE, so a prefix containing % or _ is taken literally.
    this.#db
      .prepare('DELETE FROM notification_dedupe WHERE substr(key, 1, ?) = ?')
      .run(prefix.length, prefix)
  }
}
