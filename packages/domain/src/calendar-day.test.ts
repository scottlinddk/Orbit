import { describe, expect, it } from 'vitest'
import {
  addDays,
  calendarGlance,
  FEED_CALENDAR_LIMIT,
  isTimeZone,
  localDate,
} from './calendar-day.ts'
import type { CalendarEvent } from './calendar-event.ts'

const timed = (title: string, start: string, end: string): CalendarEvent => ({
  kind: 'timed',
  id: title,
  title,
  start,
  end,
  isOverride: false,
  isRecurring: false,
})
const allDay = (title: string, startDate: string, endDate: string): CalendarEvent => ({
  kind: 'all-day',
  id: title,
  title,
  startDate,
  endDate,
  isOverride: false,
  isRecurring: false,
})

describe('localDate', () => {
  it('uses the wall clock of the zone', () => {
    const instant = new Date('2026-01-01T23:30:00Z')
    expect(localDate(instant, 'UTC')).toBe('2026-01-01')
    expect(localDate(instant, 'Europe/Copenhagen')).toBe('2026-01-02')
    expect(localDate(instant, 'America/Los_Angeles')).toBe('2026-01-01')
  })

  it('follows daylight saving time', () => {
    // Copenhagen is UTC+1 in winter and UTC+2 in summer. The clocks go forward on 29 March 2026.
    expect(localDate(new Date('2026-03-28T22:30:00Z'), 'Europe/Copenhagen')).toBe('2026-03-28')
    expect(localDate(new Date('2026-03-29T21:30:00Z'), 'Europe/Copenhagen')).toBe('2026-03-29')
    expect(localDate(new Date('2026-03-29T22:30:00Z'), 'Europe/Copenhagen')).toBe('2026-03-30')
  })
})

describe('addDays', () => {
  it('does calendar arithmetic across months and leap days', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('isTimeZone', () => {
  it('accepts IANA zones and refuses nonsense', () => {
    expect(isTimeZone('Europe/Copenhagen')).toBe(true)
    expect(isTimeZone('UTC')).toBe(true)
    expect(isTimeZone('Mars/Olympus')).toBe(false)
  })
})

describe('calendarGlance', () => {
  const now = new Date('2026-01-05T12:00:00Z')

  it('splits events into today and the next seven days', () => {
    const glance = calendarGlance(
      [
        timed('Later', '2026-01-08T10:00:00Z', '2026-01-08T11:00:00Z'),
        timed('Lunch', '2026-01-05T11:00:00Z', '2026-01-05T12:00:00Z'),
        timed('Far away', '2026-01-20T10:00:00Z', '2026-01-20T11:00:00Z'),
        timed('Yesterday', '2026-01-04T10:00:00Z', '2026-01-04T11:00:00Z'),
        allDay('Birthday', '2026-01-06', '2026-01-07'),
      ],
      now,
      'UTC',
    )
    expect(glance.today.map((e) => e.title)).toEqual(['Lunch'])
    expect(glance.upcoming.map((e) => e.title)).toEqual(['Birthday', 'Later'])
  })

  it('keeps an event that began earlier and is still going', () => {
    const glance = calendarGlance(
      [
        timed('Overnight', '2026-01-04T22:00:00Z', '2026-01-05T06:00:00Z'),
        allDay('Trip', '2026-01-03', '2026-01-08'),
      ],
      now,
      'UTC',
    )
    expect(glance.today.map((e) => e.title)).toEqual(['Trip', 'Overnight'])
  })

  it('does not count a day an event only ends on at midnight', () => {
    const glance = calendarGlance(
      [
        timed('Ends at midnight', '2026-01-04T22:00:00Z', '2026-01-05T00:00:00Z'),
        allDay('Over', '2026-01-04', '2026-01-05'),
      ],
      now,
      'UTC',
    )
    expect(glance.today).toEqual([])
  })

  it('shows all-day events as dates and timed events as instants', () => {
    const glance = calendarGlance(
      [
        allDay('Holiday', '2026-01-05', '2026-01-06'),
        timed('Call', '2026-01-05T13:00:00Z', '2026-01-05T13:30:00Z'),
      ],
      now,
      'UTC',
    )
    expect(glance.today).toEqual([
      { title: 'Holiday', allDay: true, start: '2026-01-05', end: '2026-01-06' },
      { title: 'Call', allDay: false, start: '2026-01-05T13:00:00Z', end: '2026-01-05T13:30:00Z' },
    ])
  })

  it('uses the zone for what today is, around midnight and the DST change', () => {
    // 22:30 UTC on 29 March is 00:30 on the 30th in Copenhagen, after the clocks went forward.
    const event = timed('Night shift', '2026-03-29T22:30:00Z', '2026-03-29T23:30:00Z')
    const noon = new Date('2026-03-29T12:00:00Z')
    expect(calendarGlance([event], noon, 'Europe/Copenhagen').today).toEqual([])
    expect(calendarGlance([event], noon, 'Europe/Copenhagen').upcoming).toHaveLength(1)
    expect(calendarGlance([event], noon, 'UTC').today).toHaveLength(1)
  })

  it('caps each list so a busy calendar cannot fill a feed', () => {
    const many = Array.from({ length: 60 }, (_, i) => {
      const hour = String(i % 24).padStart(2, '0')
      return timed(`T${i}`, `2026-01-05T${hour}:00:00Z`, `2026-01-05T${hour}:30:00Z`)
    })
    expect(calendarGlance(many, now, 'UTC').today).toHaveLength(FEED_CALENDAR_LIMIT)
  })
})
