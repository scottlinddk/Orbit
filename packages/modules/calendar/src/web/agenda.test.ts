import { describe, expect, it } from 'vitest'
import { dayLabel, daysOf, eventsToday, groupByDay, localDay, timeLabel } from './agenda.ts'
import type { AgendaEvent } from './data.ts'

const timed = (id: string, start: string, end: string, title = id): AgendaEvent => ({
  id,
  title,
  allDay: false,
  start,
  end,
})
const allDay = (id: string, start: string, end: string): AgendaEvent => ({
  id,
  title: id,
  allDay: true,
  start,
  end,
})

const now = new Date('2026-01-05T12:00:00Z')

describe('localDay', () => {
  it('follows the wall clock of the zone, including after a DST change', () => {
    expect(localDay(new Date('2026-01-05T23:30:00Z'), 'Europe/Copenhagen')).toBe('2026-01-06')
    expect(localDay(new Date('2026-07-05T21:30:00Z'), 'Europe/Copenhagen')).toBe('2026-07-05')
    expect(localDay(new Date('2026-07-05T22:30:00Z'), 'Europe/Copenhagen')).toBe('2026-07-06')
  })
})

describe('daysOf', () => {
  it('treats an exclusive all-day end as the day before', () => {
    expect(daysOf(allDay('a', '2026-01-05', '2026-01-08'))).toEqual({
      first: '2026-01-05',
      last: '2026-01-07',
    })
  })

  it('does not run a timed event onto the day it ends at midnight', () => {
    expect(daysOf(timed('a', '2026-01-04T22:00:00Z', '2026-01-05T00:00:00Z'), 'UTC')).toEqual({
      first: '2026-01-04',
      last: '2026-01-04',
    })
  })
})

describe('groupByDay', () => {
  it('groups by day, all-day first, and skips empty days', () => {
    const groups = groupByDay(
      [
        timed('late', '2026-01-05T15:00:00Z', '2026-01-05T16:00:00Z'),
        timed('early', '2026-01-05T08:00:00Z', '2026-01-05T09:00:00Z'),
        allDay('birthday', '2026-01-05', '2026-01-06'),
        timed('thursday', '2026-01-08T10:00:00Z', '2026-01-08T11:00:00Z'),
        timed('next month', '2026-02-08T10:00:00Z', '2026-02-08T11:00:00Z'),
      ],
      now,
      7,
      'UTC',
    )
    expect(groups.map((g) => [g.day, g.events.map((e) => e.id)])).toEqual([
      ['2026-01-05', ['birthday', 'early', 'late']],
      ['2026-01-08', ['thursday']],
    ])
  })

  it('shows a multi-day event under every day it touches', () => {
    const groups = groupByDay([allDay('trip', '2026-01-05', '2026-01-08')], now, 7, 'UTC')
    expect(groups.map((g) => g.day)).toEqual(['2026-01-05', '2026-01-06', '2026-01-07'])
  })

  it('keeps an overnight event on both days', () => {
    const groups = groupByDay(
      [timed('night', '2026-01-05T22:00:00Z', '2026-01-06T06:00:00Z')],
      now,
      3,
      'UTC',
    )
    expect(groups.map((g) => g.day)).toEqual(['2026-01-05', '2026-01-06'])
  })
})

describe('eventsToday', () => {
  it('returns only what touches today in the given zone', () => {
    const event = timed('a', '2026-01-05T23:30:00Z', '2026-01-06T00:30:00Z')
    expect(eventsToday([event], now, 'UTC').map((e) => e.id)).toEqual(['a'])
    // In Copenhagen that is already the 6th, so today (the 5th at 13:00) is empty.
    expect(eventsToday([event], now, 'Europe/Copenhagen')).toEqual([])
  })
})

describe('labels', () => {
  it('formats a time range, and nothing for an all-day event', () => {
    expect(
      timeLabel(timed('a', '2026-01-05T08:00:00Z', '2026-01-05T09:30:00Z'), 'en-GB', 'UTC'),
    ).toBe('08:00–09:30')
    expect(timeLabel(allDay('b', '2026-01-05', '2026-01-06'), 'en-GB')).toBe('')
  })

  it('formats a plain date in the viewer’s language', () => {
    expect(dayLabel('2026-01-05', 'en-GB')).toBe('Monday 5 January')
    expect(dayLabel('2026-01-05', 'da-DK')).toMatch(/^mandag.* 5\. januar$/)
  })
})
