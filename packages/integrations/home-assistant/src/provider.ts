import {
  EgressDeniedError,
  IntegrationError,
  type ConnectionTarget,
  type DiscoveredEntity,
  type EgressFetcher,
  type IntegrationProvider,
} from '@orbit/application'
import {
  InvariantViolation,
  invariant,
  type CalendarEvent,
  type ListItem,
  type ListItemDue,
  type TodoList,
} from '@orbit/domain'

const TIMEOUT_MS = 15_000
/** `GET /api/states` returns every entity of the installation, which can be a few megabytes. */
const MAX_STATES_BYTES = 8 * 1024 * 1024
const MAX_EVENTS_BYTES = 4 * 1024 * 1024
const MAX_TODO_BYTES = 2 * 1024 * 1024
const MAX_SMALL_BYTES = 256 * 1024
export const MAX_EVENTS_PER_CALENDAR = 2000
export const MAX_ITEMS_PER_TODO = 1000

type Json = unknown
const isObject = (value: Json): value is Record<string, Json> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: Json, max: number): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, max) : undefined

/**
 * Reads calendars and to-do lists from Home Assistant's REST API. Every request goes through the
 * egress guard, is limited to the host the owner typed, and carries the token in the
 * `Authorization` header only. Error messages never contain the token or the address.
 */
export function createHomeAssistantProvider(fetcher: EgressFetcher): IntegrationProvider {
  async function call(
    target: ConnectionTarget,
    path: string,
    options: { method?: 'GET' | 'POST'; body?: unknown; maxBytes: number },
  ): Promise<{ status: number; json: Json }> {
    const hostname = new URL(target.baseUrl).hostname
    let response
    try {
      response = await fetcher.fetchText({
        url: `${target.baseUrl}${path}`,
        maxBytes: options.maxBytes,
        timeoutMs: TIMEOUT_MS,
        allowedHosts: [hostname],
        headers: {
          authorization: `Bearer ${target.token}`,
          accept: 'application/json',
          ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(options.method === 'POST' ? { method: 'POST' as const } : {}),
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      })
    } catch (error) {
      if (error instanceof EgressDeniedError && error.reason === 'blocked-address')
        throw new IntegrationError(
          'Home Assistant is on a private network address. Whoever runs this server must list its host name in ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS.',
        )
      throw error
    }
    if (response.status === 401 || response.status === 403)
      throw new IntegrationError(
        'Home Assistant refused the access token. Create a new long-lived access token and try again.',
      )
    if (response.status === 404 && options.method !== 'POST') return { status: 404, json: null }
    if (response.status < 200 || response.status >= 300)
      throw new IntegrationError(`Home Assistant answered with status ${response.status}.`)
    try {
      return { status: response.status, json: JSON.parse(response.body) as Json }
    } catch {
      throw new IntegrationError(
        'Home Assistant did not answer with JSON. Check the address: it should be the one you open Home Assistant at.',
      )
    }
  }

  return {
    kind: 'homeassistant',

    parseAddress(input) {
      const trimmed = input.trim()
      invariant(trimmed.length > 0 && trimmed.length <= 2000, 'Enter the Home Assistant address')
      let parsed: URL
      try {
        parsed = new URL(trimmed)
      } catch {
        throw new InvariantViolation(
          'That is not a valid address. Include http:// or https://, for example http://homeassistant.local:8123',
        )
      }
      invariant(
        parsed.protocol === 'https:' || parsed.protocol === 'http:',
        'The address must start with http:// or https://',
      )
      invariant(
        parsed.username === '' && parsed.password === '',
        'Remove the user name and password from the address',
      )
      // Only the origin and an optional path prefix (a reverse proxy under /ha, say) are kept.
      const url = `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`
      return { url, host: parsed.host }
    },

    async discover(target) {
      // /api/states needs a valid token, so it also proves the credential before anything else.
      const states = await call(target, '/api/states', { maxBytes: MAX_STATES_BYTES })
      if (!Array.isArray(states.json))
        throw new IntegrationError('Home Assistant answered with something unexpected.')
      const found: DiscoveredEntity[] = []
      for (const state of states.json) {
        if (!isObject(state) || typeof state.entity_id !== 'string') continue
        if (!state.entity_id.startsWith('todo.')) continue
        const attributes = isObject(state.attributes) ? state.attributes : {}
        found.push({
          entityId: state.entity_id,
          role: 'todo',
          name: text(attributes.friendly_name, 80) ?? state.entity_id,
        })
      }
      // A missing endpoint means the calendar integration is not loaded: no calendars.
      const calendars = await call(target, '/api/calendars', { maxBytes: MAX_SMALL_BYTES })
      if (Array.isArray(calendars.json)) {
        for (const entry of calendars.json) {
          if (!isObject(entry) || typeof entry.entity_id !== 'string') continue
          found.push({
            entityId: entry.entity_id,
            role: 'calendar',
            name: text(entry.name, 80) ?? entry.entity_id,
          })
        }
      }
      return found.sort((a, b) => a.name.localeCompare(b.name))
    },

    async readCalendar(target, entityId, range) {
      const query = `start=${encodeURIComponent(range.from.toISOString())}&end=${encodeURIComponent(range.to.toISOString())}`
      const { json } = await call(
        target,
        `/api/calendars/${encodeURIComponent(entityId)}?${query}`,
        { maxBytes: MAX_EVENTS_BYTES },
      )
      if (json === null)
        throw new IntegrationError('Home Assistant does not know that calendar any more.')
      if (!Array.isArray(json))
        throw new IntegrationError('Home Assistant answered with something unexpected.')
      return json.slice(0, MAX_EVENTS_PER_CALENDAR).flatMap((e, i) => {
        const event = toEvent(e, i)
        return event ? [event] : []
      })
    },

    async readTodoList(target, entityId): Promise<TodoList> {
      const { json } = await call(target, '/api/services/todo/get_items?return_response', {
        method: 'POST',
        body: { entity_id: entityId },
        maxBytes: MAX_TODO_BYTES,
      })
      const response =
        isObject(json) && isObject(json.service_response) ? json.service_response : {}
      const entry = response[entityId]
      if (!isObject(entry) || !Array.isArray(entry.items))
        throw new IntegrationError('Home Assistant did not return the items of that list.')
      const items = entry.items.slice(0, MAX_ITEMS_PER_TODO).flatMap((raw, i) => {
        const item = toItem(raw, i)
        return item ? [item] : []
      })
      return { id: entityId, name: entityId, items }
    },
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** `{date}` is an all-day value, `{dateTime}` an exact one with an offset. */
function readWhen(
  value: Json,
): { kind: 'date'; date: string } | { kind: 'at'; at: string } | undefined {
  if (!isObject(value)) return undefined
  if (typeof value.date === 'string' && DATE.test(value.date))
    return { kind: 'date', date: value.date }
  if (typeof value.dateTime === 'string') {
    const ms = Date.parse(value.dateTime)
    if (Number.isFinite(ms)) return { kind: 'at', at: new Date(ms).toISOString() }
  }
  return undefined
}

const nextDay = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

/** One entry of `GET /api/calendars/<entity>`. Events that cannot be understood are dropped. */
export function toEvent(raw: Json, index: number): CalendarEvent | undefined {
  if (!isObject(raw)) return undefined
  const start = readWhen(raw.start)
  if (!start) return undefined
  const end = readWhen(raw.end)
  const title = text(raw.summary, 200) ?? '(no title)'
  const location = text(raw.location, 200)
  const uid = text(raw.uid, 120) ?? `${index}`
  const recurrence = text(raw.recurrence_id, 120)
  const isRecurring = text(raw.rrule, 500) !== undefined || recurrence !== undefined
  const base = {
    id: `${uid}|${recurrence ?? (start.kind === 'date' ? start.date : start.at)}`,
    title,
    ...(location === undefined ? {} : { location }),
    isOverride: false,
    isRecurring,
  }
  if (start.kind === 'date') {
    const endDate = end?.kind === 'date' && end.date > start.date ? end.date : nextDay(start.date)
    return { kind: 'all-day', ...base, startDate: start.date, endDate }
  }
  return {
    kind: 'timed',
    ...base,
    start: start.at,
    end: end?.kind === 'at' && end.at >= start.at ? end.at : start.at,
  }
}

/** One entry of the `todo.get_items` response. Home Assistant leaves out fields that are empty. */
export function toItem(raw: Json, index: number): ListItem | undefined {
  if (!isObject(raw)) return undefined
  const title = text(raw.summary, 200)
  const notes = text(raw.description, 500)
  const due = readDue(raw.due)
  return {
    id: text(raw.uid, 120) ?? `${index}:${title ?? ''}`,
    title: title ?? '(untitled)',
    completed: raw.status === 'completed',
    ...(due === undefined ? {} : { due }),
    ...(notes === undefined ? {} : { notes }),
  }
}

function readDue(value: Json): ListItemDue | undefined {
  if (typeof value !== 'string') return undefined
  if (DATE.test(value)) return { kind: 'date', date: value }
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? { kind: 'datetime', at: new Date(ms).toISOString() } : undefined
}
