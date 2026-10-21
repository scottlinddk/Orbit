import { describe, expect, it } from 'vitest'
import { IcsParseError, MAX_EVENTS_PER_PARSE, MAX_ICS_BYTES, parseIcs } from './parse.ts'

const calendar = (...events: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', ...events, 'END:VCALENDAR'].join('\r\n')

const vevent = (...lines: string[]) =>
  ['BEGIN:VEVENT', 'DTSTAMP:20260101T000000Z', ...lines, 'END:VEVENT'].join('\r\n')

const range = (from: string, to: string) => ({ from: new Date(from), to: new Date(to) })
const year2026 = range('2026-01-01T00:00:00Z', '2026-12-31T23:59:59Z')

describe('parseIcs', () => {
  it('maps a UTC event to an instant', () => {
    const [event] = parseIcs(
      calendar(
        vevent(
          'UID:a@test',
          'SUMMARY:Dentist',
          'LOCATION:Main Street 1',
          'DTSTART:20260310T130000Z',
          'DTEND:20260310T140000Z',
        ),
      ),
      year2026,
    )
    expect(event).toEqual({
      id: 'a@test',
      kind: 'timed',
      title: 'Dentist',
      location: 'Main Street 1',
      start: '2026-03-10T13:00:00.000Z',
      end: '2026-03-10T14:00:00.000Z',
      isOverride: false,
      isRecurring: false,
    })
  })

  it('keeps the source time zone on a zoned event', () => {
    const [event] = parseIcs(
      calendar(
        vevent(
          'UID:z@test',
          'SUMMARY:Standup',
          'DTSTART;TZID=Europe/Copenhagen:20260115T090000',
          'DTEND;TZID=Europe/Copenhagen:20260115T093000',
        ),
      ),
      year2026,
    )
    expect(event).toMatchObject({
      kind: 'timed',
      start: '2026-01-15T08:00:00.000Z',
      timeZone: 'Europe/Copenhagen',
    })
  })

  it('treats an all-day event as dates, with an exclusive end', () => {
    const [event] = parseIcs(
      calendar(
        vevent(
          'UID:d@test',
          'SUMMARY:Holiday',
          'DTSTART;VALUE=DATE:20260612',
          'DTEND;VALUE=DATE:20260614',
        ),
      ),
      year2026,
    )
    expect(event).toMatchObject({
      kind: 'all-day',
      startDate: '2026-06-12',
      endDate: '2026-06-14',
    })
  })

  it('gives an all-day event without an end one day', () => {
    const [event] = parseIcs(
      calendar(vevent('UID:d1@test', 'SUMMARY:Birthday', 'DTSTART;VALUE=DATE:20260301')),
      year2026,
    )
    expect(event).toMatchObject({ kind: 'all-day', startDate: '2026-03-01', endDate: '2026-03-02' })
  })

  it('returns only occurrences inside the range', () => {
    const feed = calendar(
      vevent('UID:in@test', 'SUMMARY:In', 'DTSTART:20260310T100000Z', 'DTEND:20260310T110000Z'),
      vevent('UID:out@test', 'SUMMARY:Out', 'DTSTART:20260910T100000Z', 'DTEND:20260910T110000Z'),
    )
    const titles = parseIcs(feed, range('2026-03-01T00:00:00Z', '2026-03-31T00:00:00Z')).map(
      (e) => e.title,
    )
    expect(titles).toEqual(['In'])
  })

  it('sorts all-day events first on a day, then by start', () => {
    const feed = calendar(
      vevent('UID:2@test', 'SUMMARY:Late', 'DTSTART:20260310T180000Z', 'DTEND:20260310T190000Z'),
      vevent('UID:1@test', 'SUMMARY:Early', 'DTSTART:20260310T060000Z', 'DTEND:20260310T070000Z'),
      vevent('UID:3@test', 'SUMMARY:All day', 'DTSTART;VALUE=DATE:20260310'),
    )
    expect(parseIcs(feed, year2026).map((e) => e.title)).toEqual(['All day', 'Early', 'Late'])
  })

  it('skips cancelled events', () => {
    const feed = calendar(
      vevent('UID:c@test', 'SUMMARY:Gone', 'STATUS:CANCELLED', 'DTSTART:20260310T100000Z'),
    )
    expect(parseIcs(feed, year2026)).toEqual([])
  })

  it('names an untitled event and strips control characters', () => {
    const feed = calendar(
      vevent('UID:n@test', 'DTSTART:20260310T100000Z', 'DTEND:20260310T110000Z'),
      vevent('UID:e@test', 'SUMMARY:Bad\u0007Title', 'DTSTART:20260311T100000Z'),
    )
    expect(parseIcs(feed, year2026).map((e) => e.title)).toEqual(['(no title)', 'BadTitle'])
  })

  it('caps very long titles', () => {
    const feed = calendar(
      vevent('UID:l@test', `SUMMARY:${'x'.repeat(5000)}`, 'DTSTART:20260310T100000Z'),
    )
    expect(parseIcs(feed, year2026)[0]?.title).toHaveLength(300)
  })

  describe('recurrence', () => {
    // Denmark moves to summer time on 2026-03-29. A weekly 09:00 meeting must stay at 09:00 local.
    const weekly = vevent(
      'UID:w@test',
      'SUMMARY:Weekly',
      'DTSTART;TZID=Europe/Copenhagen:20260320T090000',
      'DTEND;TZID=Europe/Copenhagen:20260320T100000',
      'RRULE:FREQ=WEEKLY;COUNT=3',
    )

    it('keeps the local wall-clock time across the spring DST change', () => {
      const events = parseIcs(calendar(weekly), year2026)
      expect(events.map((e) => (e.kind === 'timed' ? e.start : ''))).toEqual([
        '2026-03-20T08:00:00.000Z', // CET, UTC+1
        '2026-03-27T08:00:00.000Z', // still CET
        '2026-04-03T07:00:00.000Z', // CEST, UTC+2
      ])
      expect(events.every((e) => e.isRecurring)).toBe(true)
      expect(new Set(events.map((e) => e.id)).size).toBe(3)
    })

    it('keeps the local wall-clock time across the autumn DST change', () => {
      const feed = calendar(
        vevent(
          'UID:a@test',
          'SUMMARY:Autumn',
          'DTSTART;TZID=Europe/Copenhagen:20261023T090000',
          'DTEND;TZID=Europe/Copenhagen:20261023T100000',
          'RRULE:FREQ=WEEKLY;COUNT=2',
        ),
      )
      const starts = parseIcs(feed, year2026).map((e) => (e.kind === 'timed' ? e.start : ''))
      expect(starts).toEqual(['2026-10-23T07:00:00.000Z', '2026-10-30T08:00:00.000Z'])
    })

    it('honours EXDATE', () => {
      const feed = calendar(
        vevent(
          'UID:x@test',
          'SUMMARY:Daily',
          'DTSTART:20260601T100000Z',
          'DTEND:20260601T110000Z',
          'RRULE:FREQ=DAILY;COUNT=4',
          'EXDATE:20260602T100000Z',
        ),
      )
      const days = parseIcs(feed, year2026).map((e) =>
        e.kind === 'timed' ? e.start.slice(0, 10) : '',
      )
      expect(days).toEqual(['2026-06-01', '2026-06-03', '2026-06-04'])
    })

    it('applies a RECURRENCE-ID override', () => {
      const feed = calendar(
        vevent(
          'UID:o@test',
          'SUMMARY:Usual',
          'DTSTART:20260601T100000Z',
          'DTEND:20260601T110000Z',
          'RRULE:FREQ=DAILY;COUNT=3',
        ),
        vevent(
          'UID:o@test',
          'RECURRENCE-ID:20260602T100000Z',
          'SUMMARY:Moved',
          'DTSTART:20260602T150000Z',
          'DTEND:20260602T160000Z',
        ),
      )
      const events = parseIcs(feed, year2026)
      expect(events.map((e) => e.title)).toEqual(['Usual', 'Moved', 'Usual'])
      expect(events.map((e) => e.isOverride)).toEqual([false, true, false])
      expect(events[1]).toMatchObject({ start: '2026-06-02T15:00:00.000Z' })
    })

    it('repeats an all-day birthday yearly on the same date', () => {
      const feed = calendar(
        vevent(
          'UID:b@test',
          'SUMMARY:Birthday',
          'DTSTART;VALUE=DATE:20200229',
          'RRULE:FREQ=YEARLY',
        ),
      )
      const events = parseIcs(feed, range('2024-01-01T00:00:00Z', '2025-12-31T00:00:00Z'))
      expect(events.map((e) => (e.kind === 'all-day' ? e.startDate : ''))).toEqual(['2024-02-29'])
    })

    it('drops a runaway rule and keeps the rest of the calendar', () => {
      const feed = calendar(
        vevent(
          'UID:s@test',
          'SUMMARY:Flood',
          'DTSTART:20260101T000000Z',
          'DTEND:20260101T000001Z',
          'RRULE:FREQ=SECONDLY',
        ),
        vevent('UID:ok@test', 'SUMMARY:Fine', 'DTSTART:20260310T100000Z'),
      )
      expect(parseIcs(feed, year2026).map((e) => e.title)).toEqual(['Fine'])
    })
  })

  describe('untrusted input', () => {
    it('refuses a feed that expands to too many events', () => {
      const many = Array.from({ length: MAX_EVENTS_PER_PARSE + 1 }, (_, n) =>
        vevent(`UID:${n}@test`, 'SUMMARY:E', 'DTSTART:20260310T100000Z'),
      )
      expect(() => parseIcs(calendar(...many), year2026)).toThrow(/too many/)
    })

    it('refuses a feed over the size cap', () => {
      const big = calendar(vevent('UID:big@test', `DESCRIPTION:${'x'.repeat(MAX_ICS_BYTES)}`))
      expect(() => parseIcs(big, year2026)).toThrow(/too large/)
    })

    it('returns nothing for text that is not a calendar', () => {
      expect(parseIcs('<html>not a calendar</html>', year2026)).toEqual([])
    })

    it('rejects a backwards range', () => {
      expect(() =>
        parseIcs(calendar(), range('2026-02-01T00:00:00Z', '2026-01-01T00:00:00Z')),
      ).toThrow(IcsParseError)
    })
  })
})
