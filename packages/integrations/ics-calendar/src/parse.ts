import { Buffer } from 'node:buffer'
import ical, { type EventInstance, type ParameterValue, type VEvent } from 'node-ical'
import { compareCalendarEvents, type CalendarEvent } from '@orbit/domain'

/** A feed bigger than this is refused before it is parsed. Real household feeds are far smaller. */
export const MAX_ICS_BYTES = 5 * 1024 * 1024
/** Stops a rule such as `FREQ=SECONDLY` from filling memory. */
export const MAX_EVENTS_PER_PARSE = 5000
const MAX_TITLE_LENGTH = 300
const MAX_LOCATION_LENGTH = 300
const UTC_ZONES = new Set(['UTC', 'Etc/UTC', 'Z'])
const DAY_MS = 24 * 60 * 60 * 1000

export class IcsParseError extends Error {
  override readonly name = 'IcsParseError'
}

export interface ParseIcsOptions {
  /** Only occurrences that overlap [from, to] are returned. */
  readonly from: Date
  readonly to: Date
}

/**
 * Parses an ICS feed into normalized events. The text is untrusted: it is size-checked, parsed
 * with a library that does no I/O, and every string that reaches the model is capped.
 */
export function parseIcs(text: string, options: ParseIcsOptions): CalendarEvent[] {
  if (options.to < options.from) throw new IcsParseError('Range ends before it starts.')
  if (Buffer.byteLength(text, 'utf8') > MAX_ICS_BYTES) {
    throw new IcsParseError('The calendar feed is too large.')
  }

  let components: ReturnType<typeof ical.parseICS>
  try {
    components = ical.parseICS(text)
  } catch {
    throw new IcsParseError('The calendar feed could not be parsed.')
  }

  const events: CalendarEvent[] = []
  for (const component of Object.values(components)) {
    if (component?.type !== 'VEVENT') continue
    const vevent = component as VEvent
    if (vevent.status === 'CANCELLED' || !vevent.start) continue
    let instances: EventInstance[]
    try {
      instances = ical.expandRecurringEvent(vevent, {
        from: options.from,
        to: options.to,
        expandOngoing: true,
      })
    } catch {
      // One broken event, or a rule past the library's iteration cap, should not hide the rest
      // of the calendar.
      continue
    }
    for (const instance of instances) {
      if (instance.event.status === 'CANCELLED') continue
      events.push(toCalendarEvent(vevent, instance))
      if (events.length > MAX_EVENTS_PER_PARSE) {
        throw new IcsParseError('The calendar feed expands to too many events.')
      }
    }
  }
  return events.sort(compareCalendarEvents)
}

function toCalendarEvent(series: VEvent, instance: EventInstance): CalendarEvent {
  const source = instance.event
  const base = {
    title: clean(source.summary, MAX_TITLE_LENGTH) || '(no title)',
    ...optional('location', clean(source.location, MAX_LOCATION_LENGTH)),
    isOverride: instance.isOverride,
    isRecurring: instance.isRecurring,
  }
  const id = instance.isRecurring ? `${series.uid}@${instance.start.toISOString()}` : series.uid

  if (instance.isFullDay) {
    const startDate = dateOnly(instance.start)
    const lastDay = dateOnly(instance.end)
    // An all-day end is already exclusive in ICS. A missing or empty span still covers one day.
    const endDate = lastDay > startDate ? lastDay : addDays(startDate, 1)
    return { ...base, id, kind: 'all-day', startDate, endDate }
  }
  const zone = instance.start.tz
  const timeZone = zone && !UTC_ZONES.has(zone) ? zone : undefined
  return {
    ...base,
    id,
    kind: 'timed',
    start: instance.start.toISOString(),
    end: instance.end.toISOString(),
    ...optional('timeZone', timeZone),
  }
}

/** Spreads to nothing for an empty value, which `exactOptionalPropertyTypes` requires. */
function optional<K extends string>(key: K, value: string | undefined): { [P in K]?: string } {
  return value ? ({ [key]: value } as { [P in K]?: string }) : {}
}

function clean(value: ParameterValue | undefined, max: number): string {
  const raw = typeof value === 'string' ? value : (value?.val ?? '')
  // Control characters have no place in a title, and a cap keeps one event from dominating a view.
  return String(raw)
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max)
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(isoDate: string, days: number): string {
  return dateOnly(new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS))
}
