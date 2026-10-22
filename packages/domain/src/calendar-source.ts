import { invariant } from './errors.ts'
import type { CalendarSourceId, HouseholdId, UserId } from './ids.ts'

export const MAX_CALENDAR_SOURCES_PER_HOUSEHOLD = 10
const COLOR = /^#[0-9a-fA-F]{6}$/

/**
 * A read-only ICS feed a household shows on its dashboards. The feed URL is a credential: a
 * "secret address" from Nextcloud, Fastmail or iCloud lets anyone who knows it read the
 * calendar. It is therefore not part of this model. It lives in the SecretStore, and only the
 * host name is kept here so people can tell their sources apart.
 */
export interface CalendarSource {
  readonly id: CalendarSourceId
  readonly householdId: HouseholdId
  readonly name: string
  /** `#rrggbb`, used to tell sources apart in the agenda. */
  readonly color?: string
  /** The host of the feed address, shown to the owner. Never the path or query. */
  readonly host: string
  readonly createdBy: UserId
  readonly createdAt: Date
}

export function createCalendarSource(input: {
  id: CalendarSourceId
  householdId: HouseholdId
  name: string
  color?: string | undefined
  host: string
  createdBy: UserId
  now: Date
}): CalendarSource {
  const name = input.name.trim()
  invariant(name.length > 0 && name.length <= 80, 'Calendar name must be 1 to 80 characters')
  invariant(input.color === undefined || COLOR.test(input.color), 'Color must look like #1a2b3c')
  return {
    id: input.id,
    householdId: input.householdId,
    name,
    ...(input.color === undefined ? {} : { color: input.color.toLowerCase() }),
    host: input.host,
    createdBy: input.createdBy,
    createdAt: input.now,
  }
}
