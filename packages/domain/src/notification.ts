import { invariant } from './errors.ts'
import type { HouseholdId, NotificationEndpointId, UserId } from './ids.ts'

/** What can wake an endpoint. A new event is added here and nowhere else (ADR 0020). */
export const NOTIFICATION_EVENTS = [
  'calendar.event.starting',
  'list.item.added',
  'list.item.completed',
] as const
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number]
/** Sent by the owner's "send a test" button. Never subscribed to, never scheduled. */
export const TEST_EVENT = 'notification.test'
export type DeliveredEvent = NotificationEvent | typeof TEST_EVENT

export const MAX_NOTIFICATION_ENDPOINTS_PER_HOUSEHOLD = 10
export const DEFAULT_LEAD_MINUTES = 15
export const MIN_LEAD_MINUTES = 1
export const MAX_LEAD_MINUTES = 24 * 60
/** Tries per delivery, the first one included. */
export const MAX_DELIVERY_ATTEMPTS = 5
/** Deliveries that gave up in a row before an endpoint is switched off. */
export const AUTO_DISABLE_AFTER_FAILURES = 10
/** Log entries kept per endpoint. */
export const DELIVERY_LOG_SIZE = 20
/** A request body larger than this is never sent. */
export const MAX_NOTIFICATION_BODY_BYTES = 8 * 1024
export const MAX_WEBHOOK_URL_LENGTH = 2000

/**
 * Where a household's notifications go: a webhook the owner runs (Home Assistant, ntfy, n8n, a
 * chat bridge). The address is a credential, because chat webhooks carry their token in the
 * path, so it lives in the SecretStore and only its host is kept here, as with calendar feeds.
 * The signing secret is kept there too and is shown once.
 */
export interface NotificationEndpoint {
  readonly id: NotificationEndpointId
  readonly householdId: HouseholdId
  readonly name: string
  /** The host of the address, shown to the owner. Never the path or query. */
  readonly host: string
  readonly events: readonly NotificationEvent[]
  /** How long before an event starts `calendar.event.starting` is sent. */
  readonly leadMinutes: number
  readonly enabled: boolean
  /** Why the endpoint is off. Safe to show. Absent while it is on. */
  readonly disabledReason?: string
  /** Deliveries that gave up in a row. Reset by a delivery that arrived. */
  readonly failures: number
  readonly createdBy: UserId
  readonly createdAt: Date
}

export type DeliveryOutcome = 'delivered' | 'retrying' | 'failed' | 'dropped'

/** One attempt, kept for the owner to read. Never holds the payload or the address. */
export interface DeliveryLogEntry {
  readonly endpointId: NotificationEndpointId
  readonly deliveryId: string
  readonly event: DeliveredEvent
  readonly at: Date
  readonly attempt: number
  readonly outcome: DeliveryOutcome
  readonly httpStatus?: number
  /** Safe to show: names neither the address nor where it resolved to. */
  readonly error?: string
}

function validName(name: string): string {
  const trimmed = name.trim()
  invariant(trimmed.length > 0 && trimmed.length <= 80, 'Name must be 1 to 80 characters')
  return trimmed
}

function validEvents(events: readonly string[]): readonly NotificationEvent[] {
  invariant(events.length > 0, 'Choose at least one event')
  const known = new Set<string>(NOTIFICATION_EVENTS)
  for (const event of events) invariant(known.has(event), `Unknown event "${event}"`)
  return NOTIFICATION_EVENTS.filter((e) => events.includes(e))
}

function validLead(minutes: number): number {
  invariant(
    Number.isInteger(minutes) && minutes >= MIN_LEAD_MINUTES && minutes <= MAX_LEAD_MINUTES,
    `The reminder must be ${MIN_LEAD_MINUTES} to ${MAX_LEAD_MINUTES} minutes before the event`,
  )
  return minutes
}

export function createNotificationEndpoint(input: {
  id: NotificationEndpointId
  householdId: HouseholdId
  name: string
  host: string
  events: readonly string[]
  leadMinutes?: number | undefined
  createdBy: UserId
  now: Date
}): NotificationEndpoint {
  return {
    id: input.id,
    householdId: input.householdId,
    name: validName(input.name),
    host: input.host,
    events: validEvents(input.events),
    leadMinutes: validLead(input.leadMinutes ?? DEFAULT_LEAD_MINUTES),
    enabled: true,
    failures: 0,
    createdBy: input.createdBy,
    createdAt: input.now,
  }
}

const SWITCHED_OFF = 'Switched off by an owner'

/** Owner edits. Switching an endpoint back on clears its failures and the reason it was off. */
export function updateNotificationEndpoint(
  endpoint: NotificationEndpoint,
  changes: {
    name?: string | undefined
    events?: readonly string[] | undefined
    leadMinutes?: number | undefined
    enabled?: boolean | undefined
  },
): NotificationEndpoint {
  const { disabledReason, ...rest } = endpoint
  const enabled = changes.enabled ?? endpoint.enabled
  const edited = {
    ...rest,
    name: changes.name === undefined ? endpoint.name : validName(changes.name),
    events: changes.events === undefined ? endpoint.events : validEvents(changes.events),
    leadMinutes:
      changes.leadMinutes === undefined ? endpoint.leadMinutes : validLead(changes.leadMinutes),
    enabled,
  }
  if (enabled) return { ...edited, failures: endpoint.enabled ? endpoint.failures : 0 }
  return { ...edited, disabledReason: disabledReason ?? SWITCHED_OFF }
}

/**
 * A delivery finished. One that arrived resets the count. One that gave up counts, and the
 * tenth in a row switches the endpoint off, so a dead address stops costing requests and the
 * owner sees why.
 */
export function recordDeliveryResult(
  endpoint: NotificationEndpoint,
  result: { delivered: true } | { delivered: false; error: string },
): NotificationEndpoint {
  if (result.delivered) return endpoint.failures === 0 ? endpoint : { ...endpoint, failures: 0 }
  const failures = endpoint.failures + 1
  if (failures < AUTO_DISABLE_AFTER_FAILURES) return { ...endpoint, failures }
  return {
    ...endpoint,
    failures,
    enabled: false,
    disabledReason: `Switched off after ${AUTO_DISABLE_AFTER_FAILURES} failed deliveries in a row. Last error: ${result.error}`,
  }
}

/** Seconds to wait after attempt `attempt` failed: 30 s, 2 min, 8 min, 32 min. */
export function retryDelaySeconds(attempt: number): number {
  return Math.min(30 * 4 ** (attempt - 1), 60 * 60)
}
