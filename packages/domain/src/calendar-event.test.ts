import { describe, expect, it } from 'vitest'
import { compareCalendarEvents, type CalendarEvent } from './calendar-event.ts'

const base = { isOverride: false, isRecurring: false }
const timed = (id: string, start: string): CalendarEvent => ({
  ...base,
  id,
  title: id,
  kind: 'timed',
  start,
  end: start,
})
const allDay = (id: string, startDate: string): CalendarEvent => ({
  ...base,
  id,
  title: id,
  kind: 'all-day',
  startDate,
  endDate: startDate,
})

describe('compareCalendarEvents', () => {
  it('orders by start, with all-day events first on their day', () => {
    const events = [
      timed('b', '2026-03-10T09:00:00.000Z'),
      allDay('a', '2026-03-10'),
      timed('c', '2026-03-09T23:00:00.000Z'),
    ]
    expect(events.sort(compareCalendarEvents).map((e) => e.id)).toEqual(['c', 'a', 'b'])
  })
})
