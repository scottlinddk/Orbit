/**
 * An event from any calendar source (ICS, CalDAV, Google), reduced to what Orbit shows. Sources
 * map into this shape so the rest of the app never sees a vendor format (ADR 0003).
 *
 * Timed events are exact instants. All-day events are calendar dates with no time zone, so they
 * stay on the same day wherever the viewer is. A recurring series is expanded into one
 * `CalendarEvent` per occurrence.
 */
export interface CalendarEventBase {
  /** Stable for one occurrence: the source UID plus, for a series, the occurrence start. */
  readonly id: string
  readonly title: string
  readonly location?: string
  /** True when the series organiser moved this occurrence away from the rule. */
  readonly isOverride: boolean
  readonly isRecurring: boolean
}

export interface TimedCalendarEvent extends CalendarEventBase {
  readonly kind: 'timed'
  /** ISO 8601 instant in UTC. */
  readonly start: string
  /** ISO 8601 instant in UTC. Equal to `start` when the source gave no end. */
  readonly end: string
  /** IANA zone the source used, kept so a UI can show the event in its own zone. */
  readonly timeZone?: string
}

export interface AllDayCalendarEvent extends CalendarEventBase {
  readonly kind: 'all-day'
  /** `YYYY-MM-DD`, inclusive. */
  readonly startDate: string
  /** `YYYY-MM-DD`, exclusive: a one-day event ends the next day. */
  readonly endDate: string
}

export type CalendarEvent = TimedCalendarEvent | AllDayCalendarEvent

/** The first day an event touches, as `YYYY-MM-DD`, in UTC for timed events. */
export function calendarEventSortKey(event: CalendarEvent): string {
  return event.kind === 'all-day' ? `${event.startDate}T00:00:00.000Z` : event.start
}

/** Orders by start, all-day events before timed ones on the same day, then by title. */
export function compareCalendarEvents(a: CalendarEvent, b: CalendarEvent): number {
  const byStart = calendarEventSortKey(a).localeCompare(calendarEventSortKey(b))
  if (byStart !== 0) return byStart
  if (a.kind !== b.kind) return a.kind === 'all-day' ? -1 : 1
  return a.title.localeCompare(b.title)
}
