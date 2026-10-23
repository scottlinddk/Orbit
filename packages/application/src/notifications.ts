import {
  DELIVERY_LOG_SIZE,
  MAX_DELIVERY_ATTEMPTS,
  MAX_NOTIFICATION_BODY_BYTES,
  MAX_NOTIFICATION_ENDPOINTS_PER_HOUSEHOLD,
  NotificationEndpointId,
  TEST_EVENT,
  createNotificationEndpoint,
  invariant,
  recordDeliveryResult,
  retryDelaySeconds,
  updateNotificationEndpoint,
  type CalendarEvent,
  type DeliveredEvent,
  type DeliveryLogEntry,
  type DeliveryOutcome,
  type HouseholdId,
  type JsonObject,
  type NotificationEndpoint,
  type NotificationEvent,
} from '@orbit/domain'
import type { Actor } from './actor.ts'
import type { Clock } from './auth-ports.ts'
import { createAuthorizer } from './authorizer.ts'
import { EgressDeniedError, type EgressFetcher } from './egress.ts'
import { NotFoundError } from './errors.ts'
import type { SecretStore, JobScheduler } from './planets.ts'
import type {
  DeliveryLogRepository,
  HouseholdRepository,
  IdGenerator,
  NotificationDedupeRepository,
  NotificationEndpointRepository,
} from './ports.ts'

/** Job ids of queued deliveries. The prefix keeps them apart from Planet refreshes. */
export const NOTIFICATION_JOB_PREFIX = 'notify:'
const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS
/** What one tick of the scheduler may deliver. The rest waits for the next tick. */
const CLAIM_BATCH = 50
/** A webhook that answers with more than this is treated as broken. */
const MAX_RESPONSE_BYTES = 256 * 1024
const REQUEST_TIMEOUT_MS = 10_000
const DEFAULT_RATE_LIMIT_PER_MINUTE = 60

/**
 * The platform-dependent parts of notifications, implemented with node:crypto and the WHATWG URL
 * class where the application is wired. The domain and application layers stay free of both.
 */
export interface NotificationPlatform {
  /** A new random signing secret. */
  newSecret(): string
  /** Lowercase hex HMAC-SHA256 of `<timestamp>.<body>`, keyed with the secret. */
  sign(secret: string, timestamp: number, body: string): string
  /**
   * Checks an address an owner typed and returns what to fetch and its host. Throws
   * `InvariantViolation` with a message fit for the owner: http or https only, no password.
   */
  parseAddress(input: string): { url: string; host: string }
  /** Size of the text in UTF-8 bytes. */
  byteLength(text: string): number
}

/** What the rest of the application calls when something happened. It never throws or waits. */
export interface NotificationEventSink {
  publish(householdId: HouseholdId, event: NotificationEvent, data: JsonObject): void
}

/** The only part of the calendar service the reminders need: events already in its cache. */
export interface CalendarCache {
  cachedEventsForFeed(householdId: HouseholdId): Promise<readonly CalendarEvent[]>
}

export interface NotificationDependencies {
  endpoints: NotificationEndpointRepository
  log: DeliveryLogRepository
  dedupe: NotificationDedupeRepository
  households: HouseholdRepository
  secrets: SecretStore
  fetcher: EgressFetcher
  jobs: JobScheduler
  platform: NotificationPlatform
  calendar: CalendarCache
  clock: Clock
  ids: IdGenerator
  /** Deliveries per endpoint per minute before further ones are dropped. Defaults to 60. */
  rateLimitPerMinute?: number
}

interface JobPayload {
  endpointId: string
  deliveryId: string
  event: DeliveredEvent
  occurredAt: string
  data: JsonObject
  attempt: number
}

export interface NewEndpoint {
  readonly endpoint: NotificationEndpoint
  /** Shown once. Orbit keeps it only to sign deliveries and never returns it again. */
  readonly signingSecret: string
}

export type NotificationService = ReturnType<typeof createNotificationService>

const secretScope = (id: string) => `notification:${id}`
const URL_SECRET = 'url'
const SIGNING_SECRET = 'signing'
const jobId = (endpointId: string, deliveryId: string) =>
  `${NOTIFICATION_JOB_PREFIX}${endpointId}:${deliveryId}`

/**
 * Outgoing webhooks (ADR 0020). An owner registers an endpoint, chooses the events and gets a
 * signing secret once. Events are queued as durable jobs and delivered through the egress guard,
 * so a webhook address cannot reach the household's network unless the administrator allowed that
 * host. A delivery is tried up to five times with growing pauses. An endpoint that keeps failing
 * is switched off with a visible reason.
 */
export function createNotificationService(deps: NotificationDependencies) {
  const { endpoints, log, dedupe, secrets, fetcher, jobs, platform, calendar, clock, ids } = deps
  const authorizer = createAuthorizer(deps.households)
  const rateLimit = deps.rateLimitPerMinute ?? DEFAULT_RATE_LIMIT_PER_MINUTE
  /** Delivery times of the last minute per endpoint. In memory: it only protects the receiver. */
  const recent = new Map<string, number[]>()

  async function loadEndpoint(
    actor: Actor,
    householdId: HouseholdId,
    id: NotificationEndpointId,
  ): Promise<NotificationEndpoint> {
    await authorizer.require(actor, householdId, 'notification:manage')
    const endpoint = await endpoints.get(id)
    if (!endpoint || endpoint.householdId !== householdId) throw new NotFoundError()
    return endpoint
  }

  function withinRateLimit(endpointId: string): boolean {
    const now = clock.now().getTime()
    const times = (recent.get(endpointId) ?? []).filter((t) => now - t < MINUTE_MS)
    if (times.length >= rateLimit) {
      recent.set(endpointId, times)
      return false
    }
    times.push(now)
    recent.set(endpointId, times)
    return true
  }

  async function record(
    endpoint: NotificationEndpoint,
    job: JobPayload,
    outcome: DeliveryOutcome,
    extra: { httpStatus?: number; error?: string } = {},
  ): Promise<DeliveryLogEntry> {
    const entry: DeliveryLogEntry = {
      endpointId: endpoint.id,
      deliveryId: job.deliveryId,
      event: job.event,
      at: clock.now(),
      attempt: job.attempt,
      outcome,
      ...(extra.httpStatus === undefined ? {} : { httpStatus: extra.httpStatus }),
      ...(extra.error === undefined ? {} : { error: extra.error }),
    }
    await log.append(entry, DELIVERY_LOG_SIZE)
    return entry
  }

  /** Errors that may pass on their own. A refused address or a redirect never will. */
  const transient = (error: EgressDeniedError) =>
    error.reason === 'timeout' || error.reason === 'network' || error.reason === 'dns'

  /**
   * One request. Resolves with what happened and never throws for a network problem. When
   * `final` is true there is no retry, whatever went wrong.
   */
  async function attempt(
    endpoint: NotificationEndpoint,
    job: JobPayload,
    final: boolean,
  ): Promise<{ entry: DeliveryLogEntry; delivered: boolean }> {
    const scope = secretScope(endpoint.id)
    const [url, secret] = await Promise.all([
      secrets.get(scope, URL_SECRET),
      secrets.get(scope, SIGNING_SECRET),
    ])
    if (url === undefined || secret === undefined) {
      const entry = await record(endpoint, job, 'failed', {
        error: 'The address or signing secret is missing. Remove this endpoint and add it again.',
      })
      return { entry, delivered: false }
    }
    const body = JSON.stringify({
      version: 1,
      id: job.deliveryId,
      event: job.event,
      occurredAt: job.occurredAt,
      data: job.data,
    })
    if (platform.byteLength(body) > MAX_NOTIFICATION_BODY_BYTES) {
      const entry = await record(endpoint, job, 'failed', {
        error: 'The notification is too large to send.',
      })
      return { entry, delivered: false }
    }
    const timestamp = Math.floor(clock.now().getTime() / 1000)
    let failure: { error: string; retry: boolean; httpStatus?: number }
    try {
      const response = await fetcher.fetchText({
        url,
        method: 'POST',
        body,
        maxBytes: MAX_RESPONSE_BYTES,
        timeoutMs: REQUEST_TIMEOUT_MS,
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Orbit-Notifications/1',
          'x-orbit-event': job.event,
          'x-orbit-delivery': job.deliveryId,
          'x-orbit-timestamp': String(timestamp),
          'x-orbit-signature': `sha256=${platform.sign(secret, timestamp, body)}`,
        },
      })
      if (response.status >= 200 && response.status < 300) {
        const entry = await record(endpoint, job, 'delivered', { httpStatus: response.status })
        return { entry, delivered: true }
      }
      failure = {
        error: `The server answered ${response.status}.`,
        retry: response.status === 408 || response.status === 429 || response.status >= 500,
        httpStatus: response.status,
      }
    } catch (error) {
      failure =
        error instanceof EgressDeniedError
          ? { error: error.message, retry: transient(error) }
          : { error: 'The request could not be sent.', retry: false }
    }
    const extra = {
      error: failure.error,
      ...(failure.httpStatus === undefined ? {} : { httpStatus: failure.httpStatus }),
    }
    if (failure.retry && !final && job.attempt < MAX_DELIVERY_ATTEMPTS) {
      const entry = await record(endpoint, job, 'retrying', extra)
      await jobs.schedule({
        id: jobId(endpoint.id, job.deliveryId),
        runAt: new Date(clock.now().getTime() + retryDelaySeconds(job.attempt) * 1000),
        payload: JSON.stringify({ ...job, attempt: job.attempt + 1 } satisfies JobPayload),
      })
      return { entry, delivered: false }
    }
    return { entry: await record(endpoint, job, 'failed', extra), delivered: false }
  }

  /** Runs a queued delivery and updates the endpoint's failure count when it is settled. */
  async function run(job: JobPayload): Promise<void> {
    const endpoint = await endpoints.get(NotificationEndpointId(job.endpointId))
    if (!endpoint || !endpoint.enabled) return // removed or switched off since it was queued
    const { entry, delivered } = await attempt(endpoint, job, false)
    if (entry.outcome === 'retrying') return
    const settled = recordDeliveryResult(
      endpoint,
      delivered ? { delivered: true } : { delivered: false, error: entry.error ?? 'Failed' },
    )
    if (settled !== endpoint) await endpoints.save(settled)
  }

  async function enqueue(
    endpoint: NotificationEndpoint,
    event: NotificationEvent,
    data: JsonObject,
  ): Promise<void> {
    const job: JobPayload = {
      endpointId: endpoint.id,
      deliveryId: ids.next(),
      event,
      occurredAt: clock.now().toISOString(),
      data,
      attempt: 1,
    }
    if (!withinRateLimit(endpoint.id)) {
      await record(endpoint, job, 'dropped', { error: 'Too many notifications this minute.' })
      return
    }
    await jobs.schedule({
      id: jobId(endpoint.id, job.deliveryId),
      runAt: clock.now(),
      payload: JSON.stringify(job),
    })
  }

  async function publishNow(
    householdId: HouseholdId,
    event: NotificationEvent,
    data: JsonObject,
  ): Promise<void> {
    const targets = (await endpoints.listEnabledFor(event)).filter(
      (e) => e.householdId === householdId,
    )
    for (const endpoint of targets) await enqueue(endpoint, event, data)
  }

  /** Announces timed events that start within each endpoint's lead time, once per event. */
  async function scanCalendars(): Promise<number> {
    const now = clock.now().getTime()
    const targets = await endpoints.listEnabledFor('calendar.event.starting')
    const byHousehold = new Map<HouseholdId, NotificationEndpoint[]>()
    for (const endpoint of targets)
      byHousehold.set(endpoint.householdId, [
        ...(byHousehold.get(endpoint.householdId) ?? []),
        endpoint,
      ])
    let sent = 0
    for (const [householdId, list] of byHousehold) {
      // The cache only: a reminder never makes the calendar server be asked more often.
      const events = await calendar.cachedEventsForFeed(householdId)
      for (const event of events) {
        if (event.kind !== 'timed') continue // an all-day event has no start time to remind about
        const start = Date.parse(event.start)
        if (!(start > now)) continue
        for (const endpoint of list) {
          if (now < start - endpoint.leadMinutes * MINUTE_MS) continue
          const key = `${endpoint.id}|${event.id}|${event.start}|${endpoint.leadMinutes}`
          if (!(await dedupe.claim(key, new Date(start + DAY_MS)))) continue
          await enqueue(endpoint, 'calendar.event.starting', {
            title: event.title,
            start: event.start,
            end: event.end,
            minutesBefore: endpoint.leadMinutes,
          })
          sent += 1
        }
      }
    }
    return sent
  }

  return {
    /** Registers an endpoint. The address is checked here but not called until there is news. */
    async addEndpoint(
      actor: Actor,
      householdId: HouseholdId,
      input: {
        name: string
        url: string
        events: readonly string[]
        leadMinutes?: number | undefined
      },
    ): Promise<NewEndpoint> {
      await authorizer.require(actor, householdId, 'notification:manage')
      invariant(
        (await endpoints.listForHousehold(householdId)).length <
          MAX_NOTIFICATION_ENDPOINTS_PER_HOUSEHOLD,
        `A household can have at most ${MAX_NOTIFICATION_ENDPOINTS_PER_HOUSEHOLD} notification endpoints`,
      )
      const { url, host } = platform.parseAddress(input.url)
      const endpoint = createNotificationEndpoint({
        id: NotificationEndpointId(ids.next()),
        householdId,
        name: input.name,
        host,
        events: input.events,
        leadMinutes: input.leadMinutes,
        createdBy: actor.userId,
        now: clock.now(),
      })
      const signingSecret = platform.newSecret()
      const scope = secretScope(endpoint.id)
      await secrets.set(scope, URL_SECRET, url)
      try {
        await secrets.set(scope, SIGNING_SECRET, signingSecret)
        await endpoints.create(endpoint)
      } catch (error) {
        await secrets.deleteScope(scope)
        throw error
      }
      return { endpoint, signingSecret }
    },

    async listEndpoints(actor: Actor, householdId: HouseholdId): Promise<NotificationEndpoint[]> {
      await authorizer.require(actor, householdId, 'notification:manage')
      return endpoints.listForHousehold(householdId)
    },

    /** The id is looked up inside the household, so another household's id is not found. */
    async updateEndpoint(
      actor: Actor,
      householdId: HouseholdId,
      id: NotificationEndpointId,
      changes: {
        name?: string | undefined
        events?: readonly string[] | undefined
        leadMinutes?: number | undefined
        enabled?: boolean | undefined
      },
    ): Promise<NotificationEndpoint> {
      const updated = updateNotificationEndpoint(
        await loadEndpoint(actor, householdId, id),
        changes,
      )
      await endpoints.save(updated)
      return updated
    },

    async removeEndpoint(
      actor: Actor,
      householdId: HouseholdId,
      id: NotificationEndpointId,
    ): Promise<void> {
      await loadEndpoint(actor, householdId, id)
      await endpoints.delete(id)
      await secrets.deleteScope(secretScope(id))
      await log.deleteForEndpoint(id)
      await dedupe.deleteWithPrefix(`${id}|`)
      await jobs.cancelWithPrefix(`${NOTIFICATION_JOB_PREFIX}${id}:`)
      recent.delete(id)
    },

    /** Newest first. */
    async deliveries(
      actor: Actor,
      householdId: HouseholdId,
      id: NotificationEndpointId,
    ): Promise<DeliveryLogEntry[]> {
      await loadEndpoint(actor, householdId, id)
      return log.recent(id, DELIVERY_LOG_SIZE)
    },

    /**
     * Sends one test notification now and answers with what happened. It is tried once, works on a
     * switched-off endpoint too, and does not count toward the failures that switch one off.
     */
    async sendTest(
      actor: Actor,
      householdId: HouseholdId,
      id: NotificationEndpointId,
    ): Promise<DeliveryLogEntry> {
      const endpoint = await loadEndpoint(actor, householdId, id)
      const job: JobPayload = {
        endpointId: endpoint.id,
        deliveryId: ids.next(),
        event: TEST_EVENT,
        occurredAt: clock.now().toISOString(),
        data: { message: 'This is a test from Orbit.' },
        attempt: 1,
      }
      if (!withinRateLimit(endpoint.id))
        return record(endpoint, job, 'dropped', { error: 'Too many notifications this minute.' })
      return (await attempt(endpoint, job, true)).entry
    },

    /** For the rest of the application. Failures here never reach the caller's request. */
    sink: {
      publish(householdId: HouseholdId, event: NotificationEvent, data: JsonObject): void {
        publishNow(householdId, event, data).catch(() => undefined)
      },
    } satisfies NotificationEventSink,

    publishNow,
    scanCalendars,

    /**
     * Called on a timer by the API process: announces upcoming events, delivers what is due and
     * forgets old reminders. Returns how many deliveries it ran.
     */
    async tick(): Promise<number> {
      await scanCalendars()
      await dedupe.prune(clock.now())
      const due = await jobs.claimDue(clock.now(), CLAIM_BATCH, NOTIFICATION_JOB_PREFIX)
      let ran = 0
      for (const job of due) {
        try {
          await run(JSON.parse(job.payload) as JobPayload)
          ran += 1
        } catch {
          // A job that cannot even be read or stored is dropped. The delivery log shows the rest.
        }
      }
      return ran
    },
  }
}
