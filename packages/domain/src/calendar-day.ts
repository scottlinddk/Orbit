import { compareCalendarEvents, type CalendarEvent } from './calendar-event.ts'

const DAY_MS = 24 * 60 * 60 * 1000

/** `YYYY-MM-DD` of an instant on the wall clock of an IANA time zone. */
export function localDate(instant: Date, timeZone: string): string {
  // The `en-CA` locale formats as YYYY-MM-DD in every engine Orbit supports.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
}

/** Adds whole days to a `YYYY-MM-DD` date. Pure calendar arithmetic, so DST cannot matter. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** The first and last local date an event touches. The end date is inclusive. */
function localSpan(event: CalendarEvent, timeZone: string): { first: string; last: string } {
  if (event.kind === 'all-day') {
    // `endDate` is exclusive, and an event with no sensible end still covers its first day.
    const last = addDays(event.endDate, -1)
    return { first: event.startDate, last: last < event.startDate ? event.startDate : last }
  }
  const start = new Date(event.start)
  const end = new Date(event.end)
  const first = localDate(start, timeZone)
  // A timed event that ends at exactly midnight does not touch the next day.
  const lastInstant = end.getTime() > start.getTime() ? new Date(end.getTime() - 1) : start
  const last = localDate(lastInstant, timeZone)
  return { first, last: last < first ? first : last }
}

export const FEED_CALENDAR_LIMIT = 20
const UPCOMING_DAYS = 7

/** What a feed or display shows for one event. No location, no ids: it is a glance. */
export interface CalendarGlanceEvent {
  readonly title: string
  readonly allDay: boolean
  /** An ISO instant for timed events, `YYYY-MM-DD` for all-day ones. */
  readonly start: string
  /** Same format as `start`. For all-day events the date is exclusive. */
  readonly end: string
}

export interface CalendarGlance {
  /** Events that touch today in `timeZone`. */
  readonly today: CalendarGlanceEvent[]
  /** Events that start on one of the next seven days, after today. */
  readonly upcoming: CalendarGlanceEvent[]
}

/**
 * Picks what a small display needs from a list of events: what is on today, and what starts in
 * the next week. Days are local to `timeZone`, because "today" depends on where the household
 * lives. Both lists are capped, so a busy calendar cannot grow a feed past its size limit.
 */
export function calendarGlance(
  events: readonly CalendarEvent[],
  now: Date,
  timeZone: string,
): CalendarGlance {
  const today = localDate(now, timeZone)
  const lastDay = addDays(today, UPCOMING_DAYS)
  const todays: CalendarEvent[] = []
  const later: CalendarEvent[] = []
  for (const event of [...events].sort(compareCalendarEvents)) {
    const { first, last } = localSpan(event, timeZone)
    if (first <= today && today <= last) todays.push(event)
    else if (first > today && first <= lastDay) later.push(event)
  }
  const glance = (event: CalendarEvent): CalendarGlanceEvent =>
    event.kind === 'all-day'
      ? { title: event.title, allDay: true, start: event.startDate, end: event.endDate }
      : { title: event.title, allDay: false, start: event.start, end: event.end }
  return {
    today: todays.slice(0, FEED_CALENDAR_LIMIT).map(glance),
    upcoming: later.slice(0, FEED_CALENDAR_LIMIT).map(glance),
  }
}

/** Whether `timeZone` is a zone this runtime knows. */
export function isTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone })
    return true
  } catch {
    return false
  }
}
