import type {
  EgressFetcher,
  EgressRequest,
  EgressResponse,
  JobScheduler,
  PlanetState,
  PlanetStateStore,
  ScheduledJob,
  SecretStore,
  WebhookTarget,
} from '@orbit/application'

/** In-memory ports for the module's tests. Modules may not import adapters, so these live here. */

export class MemorySecretStore implements SecretStore {
  readonly values = new Map<string, string>()
  async set(scope: string, name: string, value: string) {
    this.values.set(`${scope}\0${name}`, value)
  }
  async get(scope: string, name: string) {
    return this.values.get(`${scope}\0${name}`)
  }
  async names(scope: string) {
    return [...this.values.keys()]
      .filter((k) => k.startsWith(`${scope}\0`))
      .map((k) => k.split('\0')[1] ?? '')
  }
  async deleteScope(scope: string) {
    for (const key of [...this.values.keys()])
      if (key.startsWith(`${scope}\0`)) this.values.delete(key)
  }
}

export class MemoryScheduler implements JobScheduler {
  readonly jobs = new Map<string, ScheduledJob>()
  async schedule(job: ScheduledJob) {
    this.jobs.set(job.id, job)
  }
  async has(id: string) {
    return this.jobs.has(id)
  }
  async claimDue(now: Date, limit: number) {
    const due = [...this.jobs.values()]
      .filter((j) => j.runAt <= now)
      .sort((a, b) => a.runAt.getTime() - b.runAt.getTime())
      .slice(0, limit)
    for (const job of due) this.jobs.delete(job.id)
    return due
  }
  async cancelWithPrefix(prefix: string) {
    for (const id of [...this.jobs.keys()]) if (id.startsWith(prefix)) this.jobs.delete(id)
  }
}

export class MemoryPlanetState implements PlanetStateStore {
  readonly states = new Map<string, PlanetState>()
  readonly webhooks = new Map<string, WebhookTarget>()
  async get(planetId: string, placementId: string) {
    return this.states.get(`${planetId}\0${placementId}`)
  }
  async save(planetId: string, placementId: string, state: PlanetState) {
    this.states.set(`${planetId}\0${placementId}`, state)
  }
  async deleteForPlanet(planetId: string) {
    for (const key of [...this.states.keys()])
      if (key.startsWith(`${planetId}\0`)) this.states.delete(key)
    for (const [hash, target] of [...this.webhooks])
      if (target.planetId === planetId) this.webhooks.delete(hash)
  }
  async saveWebhookToken(target: WebhookTarget, tokenHash: string) {
    for (const [hash, t] of [...this.webhooks]) {
      if (
        t.planetId === target.planetId &&
        t.placementId === target.placementId &&
        t.sourceId === target.sourceId
      ) {
        this.webhooks.delete(hash)
      }
    }
    this.webhooks.set(tokenHash, target)
  }
  async findWebhook(tokenHash: string) {
    return this.webhooks.get(tokenHash)
  }
}

/** Answers from a script and records every request, so tests can look at what was sent. */
export class ScriptedFetcher implements EgressFetcher {
  readonly requests: EgressRequest[] = []
  readonly #answer: (request: EgressRequest) => Partial<EgressResponse> | Error
  constructor(answer: (request: EgressRequest) => Partial<EgressResponse> | Error) {
    this.#answer = answer
  }
  async fetchText(request: EgressRequest): Promise<EgressResponse> {
    this.requests.push(request)
    const result = this.#answer(request)
    if (result instanceof Error) throw result
    return { status: 200, body: '', finalUrl: request.url, ...result }
  }
}
