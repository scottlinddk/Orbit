import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  NotFoundError,
  type JobScheduler,
  type PlanetJson,
  type PlanetState,
  type PlanetStateStore,
  type WebhookTarget,
} from '@orbit/application'
import { resolveOptions, type WidgetOption } from '@orbit/widget-sdk'
import {
  fetchSource,
  isPollable,
  secretScope,
  SourceError,
  type ConnectorDeps,
} from './connectors.ts'
import { PlanetError, widgetTypeOf, type PlanetManifest } from './manifest.ts'
import type { PlanetPackage } from './package-folder.ts'
import { MIN_SECRET_LENGTH, redactSecrets } from './redact.ts'
import { nextRefreshAt } from './schedule.ts'
import { renderTemplate, TemplateError } from './template.ts'

const CLAIM_BATCH = 20
const MAX_ERROR_LENGTH = 300

/** A webhook delivery was refused. `status` is the HTTP status the route answers with. */
export class WebhookRejectedError extends Error {
  override readonly name = 'WebhookRejectedError'
  readonly status: 400 | 401 | 413
  constructor(status: 400 | 401 | 413, message: string) {
    super(message)
    this.status = status
  }
}

export interface PlanetWidgetInfo {
  /** `planet.<id>`. */
  readonly type: string
  readonly planetId: string
  readonly title: string
  readonly description: string
  readonly defaultSpan: number
  readonly options: readonly WidgetOption[]
}

export interface PlanetRender {
  readonly html: string
  readonly updatedAt: string | undefined
  /** True when the last refresh failed and the data shown is older. */
  readonly stale: boolean
  /** Why the data is stale, or why the template failed. Safe to show. */
  readonly error: string | undefined
}

export interface PlanetRuntimeDeps extends ConnectorDeps {
  readonly planets: readonly PlanetPackage[]
  /** Persistent state. Used only by Planets that declare `permissions.storage`. */
  readonly state: PlanetStateStore
  readonly scheduler: JobScheduler
  readonly clock: { now(): Date }
  /** A number in [0, 1). Replaceable so tests are deterministic. */
  readonly random?: () => number
}

interface JobPayload {
  planetId: string
  placementId: string
  config: Record<string, string | number | boolean>
}

const jobId = (planetId: string, placementId: string) => `planet:${planetId}:${placementId}`
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

/** Converts the manifest's form definition to the widget `options` model (one form system). */
export function widgetOptionsOf(manifest: PlanetManifest): WidgetOption[] {
  return manifest.config_schema.map((o): WidgetOption => {
    const base = { key: o.key, label: o.label, ...(o.help === undefined ? {} : { help: o.help }) }
    switch (o.kind) {
      case 'select':
        return { ...base, kind: 'select', choices: o.choices, default: o.default }
      case 'number':
        return {
          ...base,
          kind: 'number',
          min: o.min,
          max: o.max,
          ...(o.step === undefined ? {} : { step: o.step }),
          default: o.default,
        }
      case 'toggle':
        return { ...base, kind: 'toggle', default: o.default }
      case 'text':
        return { ...base, kind: 'text', maxLength: o.maxLength, default: o.default }
    }
  })
}

/** Holds state in memory for Planets without the `storage` permission. Nothing reaches the disk. */
class MemoryStateStore implements Pick<PlanetStateStore, 'get' | 'save'> {
  readonly #states = new Map<string, PlanetState>()
  async get(planetId: string, placementId: string) {
    return this.#states.get(`${planetId}\0${placementId}`)
  }
  async save(planetId: string, placementId: string, state: PlanetState) {
    this.#states.set(`${planetId}\0${placementId}`, state)
  }
  clearPlanet(planetId: string) {
    for (const key of [...this.#states.keys()])
      if (key.startsWith(`${planetId}\0`)) this.#states.delete(key)
  }
}

export class PlanetRuntime {
  readonly #deps: PlanetRuntimeDeps
  readonly #byId: Map<string, PlanetPackage>
  readonly #memory = new MemoryStateStore()
  /** The config each job was last scheduled with, so an edited widget refreshes promptly. */
  readonly #seenConfig = new Map<string, string>()
  readonly #random: () => number

  constructor(deps: PlanetRuntimeDeps) {
    this.#deps = deps
    this.#byId = new Map(deps.planets.map((p) => [p.manifest.id, p]))
    this.#random = deps.random ?? Math.random
  }

  planet(id: string): PlanetPackage | undefined {
    return this.#byId.get(id)
  }

  /** What the dashboard editor offers: one widget per installed Planet. */
  widgets(): PlanetWidgetInfo[] {
    return [...this.#byId.values()].map(({ manifest }) => ({
      type: widgetTypeOf(manifest.id),
      planetId: manifest.id,
      title: manifest.render.title,
      description: manifest.render.description,
      defaultSpan: manifest.render.default_span,
      options: widgetOptionsOf(manifest),
    }))
  }

  #stateFor(pkg: PlanetPackage) {
    return pkg.manifest.permissions.storage ? this.#deps.state : this.#memory
  }

  /**
   * Renders one placement. Callers must already have authorized access to the placement's
   * dashboard. Serves the last good data and never waits for the network, except the very first
   * time, when there is nothing to show yet.
   */
  async render(
    planetId: string,
    placementId: string,
    rawConfig: Record<string, unknown>,
  ): Promise<PlanetRender> {
    const pkg = this.#byId.get(planetId)
    if (!pkg) throw new NotFoundError()
    const { manifest } = pkg
    const config = resolveOptions(widgetOptionsOf(manifest), rawConfig)
    const store = this.#stateFor(pkg)
    const polls = manifest.data_sources.some(isPollable)

    let state = await store.get(planetId, placementId)
    if (polls) {
      await this.#ensureScheduled(planetId, placementId, config)
      if (!state) state = await this.refresh(planetId, placementId, config)
    }

    const data: Record<string, PlanetJson> = {}
    for (const source of manifest.data_sources)
      if (source.type === 'static') data[source.id] = source.data
    Object.assign(data, state?.data)
    const context = {
      config,
      data,
      now: this.#deps.clock.now().toISOString(),
      planet: { id: manifest.id, name: manifest.name, version: manifest.version },
    }
    const base = {
      updatedAt: state?.updatedAt?.toISOString(),
      stale: (state?.failures ?? 0) > 0,
      error: state?.lastError,
    }
    try {
      const html = await renderTemplate(pkg.template, context, {
        rawOutput: manifest.permissions.raw_output,
      })
      return { html, ...base }
    } catch (error) {
      if (error instanceof TemplateError) return { html: '', ...base, error: error.message }
      throw error
    }
  }

  async #ensureScheduled(planetId: string, placementId: string, config: JobPayload['config']) {
    const id = jobId(planetId, placementId)
    const key = JSON.stringify(config)
    const seen = this.#seenConfig.get(id)
    this.#seenConfig.set(id, key)
    const exists = await this.#deps.scheduler.has(id)
    if (exists && (seen === undefined || seen === key)) return
    await this.#deps.scheduler.schedule({
      id,
      runAt: this.#deps.clock.now(),
      payload: JSON.stringify({ planetId, placementId, config } satisfies JobPayload),
    })
  }

  /**
   * Fetches every polling source of a placement, keeps the last good value of any source that
   * fails, records the outcome and schedules the next run with back-off after failures.
   */
  async refresh(
    planetId: string,
    placementId: string,
    config: JobPayload['config'],
  ): Promise<PlanetState> {
    const pkg = this.#byId.get(planetId)
    if (!pkg) throw new NotFoundError()
    const { manifest } = pkg
    const now = this.#deps.clock.now()
    const store = this.#stateFor(pkg)
    const previous = await store.get(planetId, placementId)
    const data: Record<string, PlanetJson> = { ...previous?.data }

    const sources = manifest.data_sources.filter(isPollable)
    const results = await Promise.allSettled(
      sources.map((source) => fetchSource(source, { manifest, config, now }, this.#deps)),
    )
    let firstError: string | undefined
    let anySucceeded = false
    results.forEach((result, i) => {
      const source = sources[i]
      if (!source) return
      if (result.status === 'fulfilled') {
        data[source.id] = result.value
        anySucceeded = true
      } else {
        firstError ??=
          result.reason instanceof SourceError
            ? result.reason.message.slice(0, MAX_ERROR_LENGTH)
            : `Source "${source.id}" failed.`
      }
    })
    const failed = firstError !== undefined
    const state: PlanetState = {
      data,
      updatedAt: anySucceeded || !failed ? now : previous?.updatedAt,
      failures: failed ? (previous?.failures ?? 0) + 1 : 0,
      lastError: firstError,
    }
    await store.save(planetId, placementId, state)
    await this.#deps.scheduler.schedule({
      id: jobId(planetId, placementId),
      runAt: nextRefreshAt({
        policy: manifest.refresh,
        now,
        consecutiveFailures: state.failures,
        random: this.#random(),
      }),
      payload: JSON.stringify({ planetId, placementId, config } satisfies JobPayload),
    })
    return state
  }

  /** Runs the refreshes that are due. Called on a timer by the API process. Returns how many ran. */
  async tick(): Promise<number> {
    const due = await this.#deps.scheduler.claimDue(this.#deps.clock.now(), CLAIM_BATCH, 'planet:')
    let ran = 0
    for (const job of due) {
      try {
        const payload = JSON.parse(job.payload) as JobPayload
        if (!this.#byId.has(payload.planetId)) continue // uninstalled or refused since
        await this.refresh(payload.planetId, payload.placementId, payload.config)
        ran += 1
      } catch {
        // A failed run is not retried here. The next render of the widget schedules it again.
      }
    }
    return ran
  }

  // --- webhooks -----------------------------------------------------------------------------

  /** Makes (or replaces) the webhook token of a source. The token is returned once, never stored. */
  async createWebhookToken(target: WebhookTarget): Promise<string> {
    const pkg = this.#byId.get(target.planetId)
    const source = pkg?.manifest.data_sources.find((s) => s.id === target.sourceId)
    if (!pkg || source?.type !== 'webhook') throw new NotFoundError()
    const token = randomBytes(32).toString('base64url')
    await this.#deps.state.saveWebhookToken(target, hashToken(token), this.#deps.clock.now())
    return token
  }

  /**
   * Accepts a payload posted to a webhook URL. An unknown token is a `NotFoundError`. The size
   * cap is checked before parsing, and a source with `hmac_secret` needs a valid
   * `x-orbit-signature: sha256=<hex>` over the raw body.
   */
  async receiveWebhook(input: {
    token: string
    body: string
    signature: string | undefined
  }): Promise<void> {
    const target = await this.#deps.state.findWebhook(hashToken(input.token))
    const pkg = target && this.#byId.get(target.planetId)
    const source = pkg?.manifest.data_sources.find((s) => s.id === target?.sourceId)
    if (!target || !pkg || source?.type !== 'webhook') throw new NotFoundError()
    if (Buffer.byteLength(input.body, 'utf8') > source.max_bytes) {
      throw new WebhookRejectedError(413, 'The payload is too large.')
    }
    const scope = secretScope(pkg.manifest.id)
    const secrets: string[] = []
    for (const name of pkg.manifest.permissions.secrets) {
      const value = await this.#deps.secrets.get(scope, name)
      if (value !== undefined) secrets.push(value)
    }
    if (source.hmac_secret) {
      const key = await this.#deps.secrets.get(scope, source.hmac_secret)
      const expected = key ? createHmac('sha256', key).update(input.body).digest('hex') : undefined
      const given = /^sha256=([0-9a-f]{64})$/i.exec(input.signature ?? '')?.[1]
      const valid =
        expected !== undefined &&
        given !== undefined &&
        timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(given, 'hex'))
      if (!valid) throw new WebhookRejectedError(401, 'The signature is missing or wrong.')
    }
    let value: PlanetJson
    try {
      value = JSON.parse(redactSecrets(input.body, secrets)) as PlanetJson
    } catch {
      throw new WebhookRejectedError(400, 'The payload is not valid JSON.')
    }
    const store = this.#deps.state
    const previous = await store.get(target.planetId, target.placementId)
    await store.save(target.planetId, target.placementId, {
      data: { ...previous?.data, [target.sourceId]: value },
      updatedAt: this.#deps.clock.now(),
      failures: previous?.failures ?? 0,
      lastError: previous?.lastError,
    })
  }

  // --- secrets and removal ------------------------------------------------------------------

  /** Sets a secret the manifest declared. The value is never read back through any API. */
  async setSecret(planetId: string, name: string, value: string): Promise<void> {
    const pkg = this.#byId.get(planetId)
    if (!pkg) throw new PlanetError(`No Planet "${planetId}" is installed.`)
    if (!pkg.manifest.permissions.secrets.includes(name)) {
      throw new PlanetError(`${pkg.manifest.name} does not declare a secret named "${name}".`)
    }
    if (value.length < MIN_SECRET_LENGTH) {
      throw new PlanetError(`A secret must be at least ${MIN_SECRET_LENGTH} characters.`)
    }
    await this.#deps.secrets.set(secretScope(planetId), name, value)
  }

  async secretNames(planetId: string): Promise<string[]> {
    return this.#deps.secrets.names(secretScope(planetId))
  }

  /** Removes everything the runtime keeps for a Planet: state, webhook tokens, secrets, jobs. */
  async removeData(planetId: string): Promise<void> {
    await this.#deps.state.deleteForPlanet(planetId)
    this.#memory.clearPlanet(planetId)
    await this.#deps.secrets.deleteScope(secretScope(planetId))
    await this.#deps.scheduler.cancelWithPrefix(`planet:${planetId}:`)
    for (const key of [...this.#seenConfig.keys()]) {
      if (key.startsWith(`planet:${planetId}:`)) this.#seenConfig.delete(key)
    }
  }
}
