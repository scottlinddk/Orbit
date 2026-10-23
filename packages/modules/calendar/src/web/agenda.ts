import type { AgendaEvent } from './data.ts'

const DAY_MS = 24 * 60 * 60 * 1000

/** `YYYY-MM-DD` of an instant on the wall clock of `timeZone` (the browser's when undefined). */
export function localDay(instant: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    ...(timeZone === undefined ? {} : { timeZone }),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
}

export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** The first and last local day an event touches. All-day end dates are exclusive. */
export function daysOf(event: AgendaEvent, timeZone?: string): { first: string; last: string } {
  if (event.allDay) {
    const last = addDays(event.end, -1)
    return { first: event.start, last: last < event.start ? event.start : last }
  }
  const start = new Date(event.start)
  const end = new Date(event.end)
  const first = localDay(start, timeZone)
  const lastInstant = end.getTime() > start.getTime() ? new Date(end.getTime() - 1) : start
  const last = localDay(lastInstant, timeZone)
  return { first, last: last < first ? first : last }
}

export interface DayGroup {
  /** `YYYY-MM-DD`. */
  readonly day: string
  readonly events: readonly AgendaEvent[]
}

/**
 * Groups events under the days they touch, from today for `days` days. An event that spans
 * several days appears under each. Within a day all-day events come first, then by start.
 */
export function groupByDay(
  events: readonly AgendaEvent[],
  now: Date,
  days: number,
  timeZone?: string,
): DayGroup[] {
  const today = localDay(now, timeZone)
  const groups: DayGroup[] = []
  for (let i = 0; i < days; i += 1) {
    const day = addDays(today, i)
    const onDay = events
      .filter((e) => {
        const { first, last } = daysOf(e, timeZone)
        return first <= day && day <= last
      })
      .sort((a, b) =>
        a.allDay !== b.allDay
          ? a.allDay
            ? -1
            : 1
          : a.start.localeCompare(b.start) || a.title.localeCompare(b.title),
      )
    if (onDay.length > 0) groups.push({ day, events: onDay })
  }
  return groups
}

export function eventsToday(
  events: readonly AgendaEvent[],
  now: Date,
  timeZone?: string,
): AgendaEvent[] {
  return groupByDay(events, now, 1, timeZone)[0]?.events.slice() ?? []
}

/** "09:00–10:00" for a timed event, empty for an all-day one. */
export function timeLabel(event: AgendaEvent, locale?: string, timeZone?: string): string {
  if (event.allDay) return ''
  const format = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone === undefined ? {} : { timeZone }),
  })
  const start = new Date(event.start)
  const end = new Date(event.end)
  return end.getTime() > start.getTime()
    ? `${format.format(start)}–${format.format(end)}`
    : format.format(start)
}

/** "Monday 5 January" in the viewer's language. The day is a plain date, so no zone applies. */
export function dayLabel(day: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${day}T00:00:00Z`))
}
