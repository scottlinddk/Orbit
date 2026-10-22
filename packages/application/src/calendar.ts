import {
  CalendarSourceId,
  MAX_CALENDAR_SOURCES_PER_HOUSEHOLD,
  InvariantViolation,
  compareCalendarEvents,
  createCalendarSource,
  invariant,
  type CalendarEvent,
  type CalendarSource,
  type HouseholdId,
} from '@orbit/domain'
import type { Actor } from './actor.ts'
import { createAuthorizer } from './authorizer.ts'
import { EgressDeniedError } from './egress.ts'
import { CalendarFeedError, NotFoundError } from './errors.ts'
import type { SecretStore } from './planets.ts'
import type {
  CalendarFeedReader,
  CalendarSourceRepository,
  HouseholdRepository,
  IdGenerator,
} from './ports.ts'
import type { Clock } from './auth-ports.ts'

const DAY_MS = 24 * 60 * 60 * 1000
/** How far back and forward events are fetched and served. One fetch per source covers it all. */
export const CALENDAR_WINDOW_PAST_DAYS = 7
export const CALENDAR_WINDOW_FUTURE_DAYS = 62
/** A household's agenda needs a few hundred events at most. */
const MAX_EVENTS_PER_RESPONSE = 1000
const DEFAULT_TTL_MS = 5 * 60 * 1000

export interface CalendarDependencies {
  sources: CalendarSourceRepository
  households: HouseholdRepository
  secrets: SecretStore
  reader: CalendarFeedReader
  clock: Clock
  ids: IdGenerator
  /** How long a fetched feed is reused. Defaults to five minutes. */
  ttlMs?: number
  /** Calendars mirrored from other systems (ADR 0019). Merged into the same answers. */
  external?: ExternalCalendars | undefined
}

export type CalendarEventWithSource = CalendarEvent & { readonly sourceId: string }

/**
 * Calendars mirrored from other systems, such as Home Assistant. The calendar service merges
 * them with its own sources and does the range filtering, so implementations return everything
 * they hold for the fetch window.
 */
export interface ExternalCalendars {
  events(
    householdId: HouseholdId,
    window: { from: Date; to: Date },
  ): Promise<{ events: CalendarEventWithSource[]; sources: CalendarSourceStatus[] }>
  /** What is cached right now. Never waits for the network, a stale mirror refreshes in the background. */
  cachedEvents(householdId: HouseholdId, window: { from: Date; to: Date }): Promise<CalendarEvent[]>
}

export interface CalendarSourceStatus {
  readonly sourceId: string
  /** Mirrored calendars only, so a member can tell them apart without seeing the connection. */
  readonly name?: string
  /** False when the last attempt to read the feed failed. Older events may still be served. */
  readonly ok: boolean
  /** When the events served were last read successfully. Null when never. */
  readonly fetchedAt: string | null
  /** Safe to show. Never contains the feed address. */
  readonly error?: string
}

export interface CalendarEvents {
  readonly events: CalendarEventWithSource[]
  readonly sources: CalendarSourceStatus[]
}

interface CacheEntry {
  readonly events: readonly CalendarEvent[]
  readonly fetchedAt: Date | undefined
  readonly checkedAt: Date
  readonly error: string | undefined
}

export type CalendarService = ReturnType<typeof createCalendarService>

const secretScope = (id: CalendarSourceId) => `calendar:${id}`
const URL_SECRET = 'url'

/**
 * Household calendars: ICS sources an owner adds, and the merged events of all of them.
 *
 * The feed address is a credential, so it is stored in the SecretStore and never returned.
 * Each source is fetched at most once per TTL for a fixed window (a week back, two months
 * ahead) and every query is answered from that. A failed refresh keeps serving the last good
 * events and says so, so a flaky calendar server does not blank the wall display.
 */
export function createCalendarService(deps: CalendarDependencies) {
  const { sources, secrets, reader, clock, ids } = deps
  const authorizer = createAuthorizer(deps.households)
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS
  const cache = new Map<CalendarSourceId, CacheEntry>()
  const inflight = new Map<CalendarSourceId, Promise<CacheEntry>>()

  function window() {
    const today = Math.floor(clock.now().getTime() / DAY_MS) * DAY_MS
    return {
      from: new Date(today - CALENDAR_WINDOW_PAST_DAYS * DAY_MS),
      to: new Date(today + CALENDAR_WINDOW_FUTURE_DAYS * DAY_MS),
    }
  }

  const message = (error: unknown): string =>
    error instanceof CalendarFeedError || error instanceof EgressDeniedError
      ? error.message
      : 'The calendar could not be read.'

  function refresh(source: CalendarSource): Promise<CacheEntry> {
    const running = inflight.get(source.id)
    if (running) return running
    const run = (async (): Promise<CacheEntry> => {
      const previous = cache.get(source.id)
      const checkedAt = clock.now()
      let entry: CacheEntry
      try {
        const url = await secrets.get(secretScope(source.id), URL_SECRET)
        if (url === undefined)
          throw new CalendarFeedError(
            'The calendar address is missing. Remove this calendar and add it again.',
          )
        const events = await reader.read(url, window())
        entry = { events, fetchedAt: checkedAt, checkedAt, error: undefined }
      } catch (error) {
        entry = {
          events: previous?.events ?? [],
          fetchedAt: previous?.fetchedAt,
          checkedAt,
          error: message(error),
        }
      }
      // A source removed while its fetch was running must not come back through the cache.
      if (await sources.get(source.id)) cache.set(source.id, entry)
      return entry
    })().finally(() => inflight.delete(source.id))
    inflight.set(source.id, run)
    return run
  }

  const isFresh = (entry: CacheEntry | undefined) =>
    entry !== undefined && clock.now().getTime() - entry.checkedAt.getTime() < ttlMs

  const overlaps = (event: CalendarEvent, from: Date, to: Date) => {
    if (event.kind === 'all-day')
      return (
        Date.parse(`${event.startDate}T00:00:00Z`) < to.getTime() &&
        Date.parse(`${event.endDate}T00:00:00Z`) > from.getTime()
      )
    const start = Date.parse(event.start)
    const end = Date.parse(event.end)
    return end > start
      ? end > from.getTime() && start < to.getTime()
      : start >= from.getTime() && start < to.getTime()
  }

  function status(source: CalendarSource, entry: CacheEntry): CalendarSourceStatus {
    return {
      sourceId: source.id,
      ok: entry.error === undefined,
      fetchedAt: entry.fetchedAt?.toISOString() ?? null,
      ...(entry.error === undefined ? {} : { error: entry.error }),
    }
  }

  return {
    /** Adds a feed after checking it can be read, so a typo is caught while the owner is here. */
    async addSource(
      actor: Actor,
      householdId: HouseholdId,
      input: { name: string; url: string; color?: string | undefined },
    ): Promise<CalendarSource> {
      await authorizer.require(actor, householdId, 'calendar:manage')
      const existing = await sources.listForHousehold(householdId)
      invariant(
        existing.length < MAX_CALENDAR_SOURCES_PER_HOUSEHOLD,
        `A household can have at most ${MAX_CALENDAR_SOURCES_PER_HOUSEHOLD} calendars`,
      )
      const { url, host } = reader.parseAddress(input.url)
      const source = createCalendarSource({
        id: CalendarSourceId(ids.next()),
        householdId,
        name: input.name,
        color: input.color,
        host,
        createdBy: actor.userId,
        now: clock.now(),
      })
      const now = clock.now()
      try {
        await reader.read(url, { from: now, to: new Date(now.getTime() + DAY_MS) })
      } catch (error) {
        throw new InvariantViolation(`That calendar could not be read. ${message(error)}`)
      }
      await secrets.set(secretScope(source.id), URL_SECRET, url)
      try {
        await sources.create(source)
      } catch (error) {
        await secrets.deleteScope(secretScope(source.id))
        throw error
      }
      return source
    },

    async listSources(actor: Actor, householdId: HouseholdId): Promise<CalendarSource[]> {
      await authorizer.require(actor, householdId, 'calendar:view')
      return sources.listForHousehold(householdId)
    },

    /** The id is looked up inside the household, so another household's source id is not found. */
    async removeSource(
      actor: Actor,
      householdId: HouseholdId,
      sourceId: CalendarSourceId,
    ): Promise<void> {
      await authorizer.require(actor, householdId, 'calendar:manage')
      const source = await sources.get(sourceId)
      if (!source || source.householdId !== householdId) throw new NotFoundError()
      await sources.delete(sourceId)
      cache.delete(sourceId)
      await secrets.deleteScope(secretScope(sourceId))
    },

    /** Merged events of every source that overlap [from, to), oldest first. */
    async events(
      actor: Actor,
      householdId: HouseholdId,
      requested: { from?: Date | undefined; to?: Date | undefined },
    ): Promise<CalendarEvents> {
      await authorizer.require(actor, householdId, 'calendar:view')
      const bounds = window()
      // Without a range: from the start of today (UTC) for a week.
      const from =
        requested.from ?? new Date(bounds.from.getTime() + CALENDAR_WINDOW_PAST_DAYS * DAY_MS)
      const range = { from, to: requested.to ?? new Date(from.getTime() + 7 * DAY_MS) }
      invariant(range.to > range.from, 'The range must end after it starts')
      invariant(
        range.from >= bounds.from && range.to <= bounds.to,
        `Events are available from ${CALENDAR_WINDOW_PAST_DAYS} days ago to ${CALENDAR_WINDOW_FUTURE_DAYS} days ahead`,
      )
      const list = await sources.listForHousehold(householdId)
      const entries = await Promise.all(
        list.map(async (source) => {
          const cached = cache.get(source.id)
          return [source, isFresh(cached) ? cached! : await refresh(source)] as const
        }),
      )
      const mirrored = (await deps.external?.events(householdId, bounds)) ?? {
        events: [],
        sources: [],
      }
      const events = [
        ...entries.flatMap(([source, entry]) =>
          entry.events.map((e): CalendarEventWithSource => ({ ...e, sourceId: source.id })),
        ),
        ...mirrored.events,
      ]
        .filter((e) => overlaps(e, range.from, range.to))
        .sort(compareCalendarEvents)
        .slice(0, MAX_EVENTS_PER_RESPONSE)
      return {
        events,
        sources: [...entries.map(([source, entry]) => status(source, entry)), ...mirrored.sources],
      }
    },

    /**
     * What a display with a feed token may show, with no actor. It never waits for the
     * network: a display polls on a short timeout, so it gets the last good events at once and
     * a stale or missing source is refreshed in the background for the next poll.
     */
    async cachedEventsForFeed(householdId: HouseholdId): Promise<CalendarEvent[]> {
      const list = await sources.listForHousehold(householdId)
      const events: CalendarEvent[] = []
      for (const source of list) {
        const cached = cache.get(source.id)
        if (!isFresh(cached)) refresh(source).catch(() => undefined)
        if (cached) events.push(...cached.events)
      }
      events.push(...((await deps.external?.cachedEvents(householdId, window())) ?? []))
      return events.sort(compareCalendarEvents)
    },
  }
}
