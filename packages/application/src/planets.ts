/**
 * Ports used by Planets (ADR 0017) and by anything else that needs a stored credential or a
 * job that runs later. Adapters implement them; the Planet module depends only on these.
 */

/**
 * Credentials kept encrypted at rest. A secret is addressed by a scope (for a Planet,
 * `planet:<id>`) and a name. Values are never returned by the HTTP API or written to logs.
 */
export interface SecretStore {
  set(scope: string, name: string, value: string): Promise<void>
  get(scope: string, name: string): Promise<string | undefined>
  /** Names only, never values. */
  names(scope: string): Promise<string[]>
  /** Removes every secret of the scope. Used when the owner of the scope is uninstalled. */
  deleteScope(scope: string): Promise<void>
}

export interface ScheduledJob {
  /** Scheduling a job with an id that exists replaces it. */
  readonly id: string
  readonly runAt: Date
  /** Opaque to the scheduler. */
  readonly payload: string
}

export interface JobScheduler {
  schedule(job: ScheduledJob): Promise<void>
  has(id: string): Promise<boolean>
  /**
   * Removes and returns jobs due at `now`, oldest first. A job that is claimed is gone, so the
   * handler schedules the next run itself. Two callers never receive the same job. With a
   * `prefix` only jobs whose id starts with it are claimed, so Planets (`planet:`) and
   * notifications (`notify:`) share the table without taking each other's jobs.
   */
  claimDue(now: Date, limit: number, prefix?: string): Promise<ScheduledJob[]>
  cancelWithPrefix(prefix: string): Promise<void>
}

export type PlanetJson =
  string | number | boolean | null | readonly PlanetJson[] | { readonly [key: string]: PlanetJson }

/** What a Planet placement last fetched, kept so a failed refresh still shows the last good data. */
export interface PlanetState {
  /** Latest good value per data source id. */
  readonly data: { readonly [sourceId: string]: PlanetJson }
  /** When any source last refreshed successfully. */
  readonly updatedAt: Date | undefined
  /** Refreshes that failed in a row. Resets on success. */
  readonly failures: number
  /** A message safe to show: secrets are removed and addresses are not named. */
  readonly lastError: string | undefined
}

export interface WebhookTarget {
  readonly planetId: string
  readonly placementId: string
  readonly sourceId: string
}

export interface PlanetStateStore {
  get(planetId: string, placementId: string): Promise<PlanetState | undefined>
  save(planetId: string, placementId: string, state: PlanetState): Promise<void>
  /** Removes state and webhook tokens of every placement of the Planet. */
  deleteForPlanet(planetId: string): Promise<void>
  /** Stores the hash of a new token. Replaces the token of the same source. */
  saveWebhookToken(target: WebhookTarget, tokenHash: string, now: Date): Promise<void>
  findWebhook(tokenHash: string): Promise<WebhookTarget | undefined>
}
