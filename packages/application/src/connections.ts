import {
  ConnectionId,
  InvariantViolation,
  MAX_CONNECTIONS_PER_HOUSEHOLD,
  MAX_ITEMS_PER_LIST,
  MAX_ITEM_NOTE,
  MAX_ITEM_TEXT,
  createConnection,
  externalId,
  invariant,
  parseExternalId,
  withMirrors,
  type CalendarEvent,
  type Connection,
  type ConnectionKind,
  type HouseholdId,
  type HouseholdList,
  type HouseholdListItem,
  type ListId,
  type ListItemId,
  type Mirror,
  type MirrorRole,
  type TodoList,
} from '@orbit/domain'
import type { Actor } from './actor.ts'
import type { Clock } from './auth-ports.ts'
import { createAuthorizer } from './authorizer.ts'
import type {
  CalendarEventWithSource,
  CalendarSourceStatus,
  ExternalCalendars,
} from './calendar.ts'
import { EgressDeniedError } from './egress.ts'
import { IntegrationError, NotFoundError } from './errors.ts'
import type { ConnectionTarget, DiscoveredEntity, IntegrationProvider } from './integrations.ts'
import type { ExternalLists, ListDetail, ListSummary } from './lists.ts'
import type { SecretStore } from './planets.ts'
import type { ConnectionRepository, HouseholdRepository, IdGenerator } from './ports.ts'

const CALENDAR_TTL_MS = 5 * 60 * 1000
/** Lists are ticked off at the shop, so they are re-read sooner than calendars. */
const LIST_TTL_MS = 60 * 1000

export interface ConnectionDependencies {
  connections: ConnectionRepository
  households: HouseholdRepository
  secrets: SecretStore
  providers: readonly IntegrationProvider[]
  clock: Clock
  ids: IdGenerator
  calendarTtlMs?: number | undefined
  listTtlMs?: number | undefined
}

export interface DiscoveredEntityState extends DiscoveredEntity {
  readonly mirrored: boolean
}

export type ConnectionService = ReturnType<typeof createConnectionService>

const secretScope = (id: ConnectionId) => `connection:${id}`
const URL_SECRET = 'url'
const TOKEN_SECRET = 'token'

interface CacheEntry<T> {
  readonly value: T
  readonly fetchedAt: Date | undefined
  readonly checkedAt: Date
  readonly error: string | undefined
}

/**
 * Connections to other self-hosted systems, and the data mirrored from them (ADR 0019).
 *
 * The address and access token are credentials of the other system: they go to the SecretStore
 * and are never returned. Owners manage connections. Everyone who may see the calendar or the
 * lists sees what was mirrored, through the calendar and list endpoints, without learning
 * anything about the connection. Mirrors are read only, cached with a TTL, and a failed refresh
 * keeps serving the last good copy and says so.
 */
export function createConnectionService(deps: ConnectionDependencies) {
  const { connections, secrets, clock, ids } = deps
  const authorizer = createAuthorizer(deps.households)
  const calendarTtl = deps.calendarTtlMs ?? CALENDAR_TTL_MS
  const listTtl = deps.listTtlMs ?? LIST_TTL_MS
  const providers = new Map(deps.providers.map((p) => [p.kind, p]))
  const calendars = new Map<string, CacheEntry<readonly CalendarEvent[]>>()
  const todos = new Map<string, CacheEntry<TodoList | undefined>>()
  const inflight = new Map<string, Promise<unknown>>()

  const provider = (kind: ConnectionKind): IntegrationProvider => {
    const found = providers.get(kind)
    invariant(found !== undefined, 'That kind of connection is not available on this server')
    return found
  }

  const message = (error: unknown): string =>
    error instanceof IntegrationError || error instanceof EgressDeniedError
      ? error.message
      : 'The other system could not be read.'

  async function target(connection: Connection): Promise<ConnectionTarget> {
    const [baseUrl, token] = await Promise.all([
      secrets.get(secretScope(connection.id), URL_SECRET),
      secrets.get(secretScope(connection.id), TOKEN_SECRET),
    ])
    if (baseUrl === undefined || token === undefined)
      throw new IntegrationError(
        'The saved address or access token is missing. Remove this connection and add it again.',
      )
    return { baseUrl, token }
  }

  /** Looks a connection up inside the household, so another household's id is not found. */
  async function owned(householdId: HouseholdId, id: ConnectionId): Promise<Connection> {
    const connection = await connections.get(id)
    if (!connection || connection.householdId !== householdId) throw new NotFoundError()
    return connection
  }

  async function discoverFor(connection: Connection): Promise<DiscoveredEntity[]> {
    return provider(connection.kind).discover(await target(connection))
  }

  const isFresh = (entry: CacheEntry<unknown> | undefined, ttl: number) =>
    entry !== undefined && clock.now().getTime() - entry.checkedAt.getTime() < ttl

  /** Runs one refresh per key at a time. Concurrent callers share it. */
  function once<T>(key: string, run: () => Promise<T>): Promise<T> {
    const running = inflight.get(key) as Promise<T> | undefined
    if (running) return running
    const started = run().finally(() => inflight.delete(key))
    inflight.set(key, started)
    return started
  }

  async function mirrorsOf(householdId: HouseholdId, role: MirrorRole) {
    const all = await connections.listForHousehold(householdId)
    return all.flatMap((connection) =>
      connection.mirrors.filter((m) => m.role === role).map((mirror) => ({ connection, mirror })),
    )
  }

  const stillMirrored = async (connection: Connection, mirror: Mirror) =>
    (await connections.get(connection.id))?.mirrors.some((m) => m.entityId === mirror.entityId)

  function refreshCalendar(
    connection: Connection,
    mirror: Mirror,
    window: { from: Date; to: Date },
  ): Promise<CacheEntry<readonly CalendarEvent[]>> {
    const key = externalId(connection.id, mirror.entityId)
    return once(key, async () => {
      const previous = calendars.get(key)
      const checkedAt = clock.now()
      let entry: CacheEntry<readonly CalendarEvent[]>
      try {
        const events = await provider(connection.kind).readCalendar(
          await target(connection),
          mirror.entityId,
          window,
        )
        entry = { value: events, fetchedAt: checkedAt, checkedAt, error: undefined }
      } catch (error) {
        entry = {
          value: previous?.value ?? [],
          fetchedAt: previous?.fetchedAt,
          checkedAt,
          error: message(error),
        }
      }
      // A mirror removed while its fetch ran must not come back through the cache.
      if (await stillMirrored(connection, mirror)) calendars.set(key, entry)
      return entry
    })
  }

  function refreshTodo(
    connection: Connection,
    mirror: Mirror,
  ): Promise<CacheEntry<TodoList | undefined>> {
    const key = externalId(connection.id, mirror.entityId)
    return once(key, async () => {
      const previous = todos.get(key)
      const checkedAt = clock.now()
      let entry: CacheEntry<TodoList | undefined>
      try {
        const list = await provider(connection.kind).readTodoList(
          await target(connection),
          mirror.entityId,
        )
        entry = { value: list, fetchedAt: checkedAt, checkedAt, error: undefined }
      } catch (error) {
        entry = {
          value: previous?.value,
          fetchedAt: previous?.fetchedAt,
          checkedAt,
          error: message(error),
        }
      }
      if (await stillMirrored(connection, mirror)) todos.set(key, entry)
      return entry
    })
  }

  const forget = (connection: Connection) => {
    for (const m of connection.mirrors) {
      calendars.delete(externalId(connection.id, m.entityId))
      todos.delete(externalId(connection.id, m.entityId))
    }
  }

  function listOf(connection: Connection, mirror: Mirror): HouseholdList {
    return {
      id: externalId(connection.id, mirror.entityId) as ListId,
      householdId: connection.householdId,
      name: mirror.name,
      kind: 'todo',
      createdBy: connection.createdBy,
      createdAt: connection.createdAt,
      source: { kind: connection.kind, connectionId: connection.id },
    }
  }

  function itemsOf(
    connection: Connection,
    list: HouseholdList,
    entry: CacheEntry<TodoList | undefined>,
  ): HouseholdListItem[] {
    const at = entry.fetchedAt ?? connection.createdAt
    return (entry.value?.items ?? [])
      .slice(0, MAX_ITEMS_PER_LIST)
      .map((item, position): HouseholdListItem => ({
        id: item.id as ListItemId,
        listId: list.id,
        text: item.title.slice(0, MAX_ITEM_TEXT) || '(untitled)',
        done: item.completed,
        ...(item.notes === undefined ? {} : { note: item.notes.slice(0, MAX_ITEM_NOTE) }),
        position,
        createdBy: connection.createdBy,
        createdAt: at,
        updatedBy: connection.createdBy,
        updatedAt: at,
      }))
  }

  const calendarsReader: ExternalCalendars = {
    async events(householdId, window) {
      const mirrored = await mirrorsOf(householdId, 'calendar')
      const entries = await Promise.all(
        mirrored.map(async ({ connection, mirror }) => {
          const cached = calendars.get(externalId(connection.id, mirror.entityId))
          const entry = isFresh(cached, calendarTtl)
            ? cached!
            : await refreshCalendar(connection, mirror, window)
          return { connection, mirror, entry }
        }),
      )
      const events: CalendarEventWithSource[] = []
      const sources: CalendarSourceStatus[] = []
      for (const { connection, mirror, entry } of entries) {
        const sourceId = externalId(connection.id, mirror.entityId)
        for (const e of entry.value) events.push({ ...e, sourceId })
        sources.push({
          sourceId,
          name: mirror.name,
          ok: entry.error === undefined,
          fetchedAt: entry.fetchedAt?.toISOString() ?? null,
          ...(entry.error === undefined ? {} : { error: entry.error }),
        })
      }
      return { events, sources }
    },

    /** Never waits for the network: a stale mirror is refreshed in the background. */
    async cachedEvents(householdId, window) {
      const events: CalendarEvent[] = []
      for (const { connection, mirror } of await mirrorsOf(householdId, 'calendar')) {
        const cached = calendars.get(externalId(connection.id, mirror.entityId))
        if (!isFresh(cached, calendarTtl))
          refreshCalendar(connection, mirror, window).catch(() => undefined)
        if (cached) events.push(...cached.value)
      }
      return events
    },
  }

  const listsReader: ExternalLists = {
    owns: (id) => parseExternalId(id) !== undefined,

    async summaries(householdId): Promise<ListSummary[]> {
      const mirrored = await mirrorsOf(householdId, 'todo')
      return Promise.all(
        mirrored.map(async ({ connection, mirror }) => {
          const cached = todos.get(externalId(connection.id, mirror.entityId))
          const entry = isFresh(cached, listTtl) ? cached! : await refreshTodo(connection, mirror)
          const list = listOf(connection, mirror)
          const items = itemsOf(connection, list, entry)
          return {
            list,
            itemCount: items.length,
            openCount: items.filter((i) => !i.done).length,
            ...(entry.error === undefined ? {} : { syncError: entry.error }),
          }
        }),
      )
    },

    async detail(householdId, id): Promise<ListDetail | undefined> {
      const parsed = parseExternalId(id)
      if (!parsed) return undefined
      const connection = await connections.get(parsed.connectionId as ConnectionId)
      if (!connection || connection.householdId !== householdId) return undefined
      const mirror = connection.mirrors.find(
        (m) => m.role === 'todo' && m.entityId === parsed.entityId,
      )
      if (!mirror) return undefined
      const cached = todos.get(id)
      const entry = isFresh(cached, listTtl) ? cached! : await refreshTodo(connection, mirror)
      const list = listOf(connection, mirror)
      return {
        list,
        items: itemsOf(connection, list, entry),
        ...(entry.error === undefined ? {} : { syncError: entry.error }),
      }
    },
  }

  return {
    calendars: calendarsReader,
    lists: listsReader,

    /** Checks the address and token against the other system before anything is saved. */
    async addConnection(
      actor: Actor,
      householdId: HouseholdId,
      input: { kind: ConnectionKind; name: string; url: string; token: string },
    ): Promise<Connection> {
      await authorizer.require(actor, householdId, 'connection:manage')
      invariant(
        (await connections.listForHousehold(householdId)).length < MAX_CONNECTIONS_PER_HOUSEHOLD,
        `A household can have at most ${MAX_CONNECTIONS_PER_HOUSEHOLD} connections`,
      )
      invariant(input.token.trim().length > 0, 'Enter the access token')
      const impl = provider(input.kind)
      const { url, host } = impl.parseAddress(input.url)
      const connection = createConnection({
        id: ConnectionId(ids.next()),
        householdId,
        kind: input.kind,
        name: input.name,
        host,
        createdBy: actor.userId,
        now: clock.now(),
      })
      const token = input.token.trim()
      try {
        await impl.discover({ baseUrl: url, token })
      } catch (error) {
        throw new InvariantViolation(`That connection could not be used. ${message(error)}`)
      }
      const scope = secretScope(connection.id)
      await secrets.set(scope, URL_SECRET, url)
      await secrets.set(scope, TOKEN_SECRET, token)
      try {
        await connections.create(connection)
      } catch (error) {
        await secrets.deleteScope(scope)
        throw error
      }
      return connection
    },

    async listConnections(actor: Actor, householdId: HouseholdId): Promise<Connection[]> {
      await authorizer.require(actor, householdId, 'connection:manage')
      return connections.listForHousehold(householdId)
    },

    /** Asks the other system what could be mirrored, and marks what already is. */
    async discover(
      actor: Actor,
      householdId: HouseholdId,
      id: ConnectionId,
    ): Promise<DiscoveredEntityState[]> {
      await authorizer.require(actor, householdId, 'connection:manage')
      const connection = await owned(householdId, id)
      try {
        const found = await discoverFor(connection)
        const chosen = new Set(connection.mirrors.map((m) => m.entityId))
        return found.map((e) => ({ ...e, mirrored: chosen.has(e.entityId) }))
      } catch (error) {
        throw new InvariantViolation(`The other system could not be read. ${message(error)}`)
      }
    },

    /** A check that reports instead of throwing, for the "test connection" button. */
    async test(
      actor: Actor,
      householdId: HouseholdId,
      id: ConnectionId,
    ): Promise<{ ok: boolean; calendars: number; todoLists: number; error?: string }> {
      await authorizer.require(actor, householdId, 'connection:manage')
      const connection = await owned(householdId, id)
      try {
        const found = await discoverFor(connection)
        return {
          ok: true,
          calendars: found.filter((e) => e.role === 'calendar').length,
          todoLists: found.filter((e) => e.role === 'todo').length,
        }
      } catch (error) {
        return { ok: false, calendars: 0, todoLists: 0, error: message(error) }
      }
    },

    /** Replaces what is mirrored. Every entity must exist in the other system right now. */
    async setMirrors(
      actor: Actor,
      householdId: HouseholdId,
      id: ConnectionId,
      entityIds: readonly string[],
    ): Promise<Connection> {
      await authorizer.require(actor, householdId, 'connection:manage')
      const connection = await owned(householdId, id)
      let found: DiscoveredEntity[]
      try {
        found = await discoverFor(connection)
      } catch (error) {
        throw new InvariantViolation(`The other system could not be read. ${message(error)}`)
      }
      const byId = new Map(found.map((e) => [e.entityId, e]))
      const mirrors = entityIds.map((entityId): Mirror => {
        const entity = byId.get(entityId)
        invariant(entity !== undefined, `${entityId} was not found in the other system`)
        return { entityId, role: entity.role, name: entity.name }
      })
      const updated = withMirrors(connection, mirrors)
      await connections.save(updated)
      forget(connection)
      return updated
    },

    async removeConnection(
      actor: Actor,
      householdId: HouseholdId,
      id: ConnectionId,
    ): Promise<void> {
      await authorizer.require(actor, householdId, 'connection:manage')
      const connection = await owned(householdId, id)
      await connections.delete(id)
      forget(connection)
      await secrets.deleteScope(secretScope(id))
    },
  }
}
