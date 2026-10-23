import { z } from 'zod'

export const calendarSourceSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    color: z.string().optional(),
    /** Only the host. The full address is a secret and is never returned. */
    host: z.string(),
    createdAt: z.string(),
  })
  .meta({ id: 'CalendarSource' })
export type CalendarSourceResponse = z.infer<typeof calendarSourceSchema>

export const createCalendarSourceRequestSchema = z.strictObject({
  name: z.string().min(1).max(80),
  /** The ICS address. `webcal://` works. Orbit keeps it encrypted and never shows it again. */
  url: z.string().min(1).max(2000),
  /** `#rrggbb`. */
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
})

const eventBase = {
  id: z.string(),
  sourceId: z.string(),
  title: z.string(),
  location: z.string().optional(),
  isRecurring: z.boolean(),
  isOverride: z.boolean(),
}

export const calendarEventSchema = z
  .discriminatedUnion('kind', [
    z.object({
      ...eventBase,
      kind: z.literal('timed'),
      /** ISO 8601 instant in UTC. */
      start: z.string(),
      end: z.string(),
      /** IANA zone the calendar used for this event. */
      timeZone: z.string().optional(),
    }),
    z.object({
      ...eventBase,
      kind: z.literal('all-day'),
      /** `YYYY-MM-DD`, inclusive. */
      startDate: z.string(),
      /** `YYYY-MM-DD`, exclusive. */
      endDate: z.string(),
    }),
  ])
  .meta({ id: 'CalendarEvent' })
export type CalendarEventResponse = z.infer<typeof calendarEventSchema>

export const calendarSourceStatusSchema = z
  .object({
    sourceId: z.string(),
    /** Calendars mirrored from another system only. Own calendars are named in the sources list. */
    name: z.string().optional(),
    /** False when the last attempt to read the calendar failed. */
    ok: z.boolean(),
    /** When the events shown were last read successfully, or null if never. */
    fetchedAt: z.string().nullable(),
    /** Safe to show. Never contains the calendar address. */
    error: z.string().optional(),
  })
  .meta({ id: 'CalendarSourceStatus' })

export const calendarEventsSchema = z
  .object({
    events: z.array(calendarEventSchema),
    sources: z.array(calendarSourceStatusSchema),
  })
  .meta({ id: 'CalendarEvents' })
export type CalendarEventsResponse = z.infer<typeof calendarEventsSchema>

const instant = z.union([z.iso.datetime({ offset: true }), z.iso.date()])

export const calendarEventsQuerySchema = z.strictObject({
  /** Start of the range. A date means midnight UTC. Defaults to the start of today (UTC). */
  from: instant.optional(),
  /** End of the range, exclusive. Defaults to seven days after `from`. */
  to: instant.optional(),
})
