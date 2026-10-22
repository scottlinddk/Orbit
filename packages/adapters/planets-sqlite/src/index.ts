import type { DatabaseSync } from 'node:sqlite'
import type { PlanetJson, PlanetState, PlanetStateStore, WebhookTarget } from '@orbit/application'

interface StateRow {
  data: string
  updated_at: string | null
  failures: number
  last_error: string | null
}

export class SqlitePlanetStateStore implements PlanetStateStore {
  readonly #db: DatabaseSync

  constructor(db: DatabaseSync) {
    this.#db = db
  }

  async get(planetId: string, placementId: string): Promise<PlanetState | undefined> {
    const row = this.#db
      .prepare(
        'SELECT data, updated_at, failures, last_error FROM planet_state WHERE planet_id = ? AND placement_id = ?',
      )
      .get(planetId, placementId) as unknown as StateRow | undefined
    if (!row) return undefined
    return {
      data: JSON.parse(row.data) as Record<string, PlanetJson>,
      updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
      failures: row.failures,
      lastError: row.last_error ?? undefined,
    }
  }

  async save(planetId: string, placementId: string, state: PlanetState): Promise<void> {
    this.#db
      .prepare(
        `INSERT INTO planet_state (planet_id, placement_id, data, updated_at, failures, last_error)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (planet_id, placement_id) DO UPDATE SET
           data = excluded.data, updated_at = excluded.updated_at,
           failures = excluded.failures, last_error = excluded.last_error`,
      )
      .run(
        planetId,
        placementId,
        JSON.stringify(state.data),
        state.updatedAt?.toISOString() ?? null,
        state.failures,
        state.lastError ?? null,
      )
  }

  async deleteForPlanet(planetId: string): Promise<void> {
    this.#db.prepare('DELETE FROM planet_state WHERE planet_id = ?').run(planetId)
    this.#db.prepare('DELETE FROM planet_webhooks WHERE planet_id = ?').run(planetId)
  }

  async saveWebhookToken(target: WebhookTarget, tokenHash: string, now: Date): Promise<void> {
    this.#db
      .prepare(
        `INSERT INTO planet_webhooks (token_hash, planet_id, placement_id, source_id, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (planet_id, placement_id, source_id) DO UPDATE SET
           token_hash = excluded.token_hash, created_at = excluded.created_at`,
      )
      .run(tokenHash, target.planetId, target.placementId, target.sourceId, now.toISOString())
  }

  async findWebhook(tokenHash: string): Promise<WebhookTarget | undefined> {
    const row = this.#db
      .prepare(
        'SELECT planet_id, placement_id, source_id FROM planet_webhooks WHERE token_hash = ?',
      )
      .get(tokenHash) as { planet_id: string; placement_id: string; source_id: string } | undefined
    return row
      ? { planetId: row.planet_id, placementId: row.placement_id, sourceId: row.source_id }
      : undefined
  }
}
