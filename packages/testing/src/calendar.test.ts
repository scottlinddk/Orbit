import { ForbiddenError, NotFoundError, type Actor } from '@orbit/application'
import {
  CalendarSourceId,
  InvariantViolation,
  type CalendarEvent,
  type HouseholdId,
} from '@orbit/domain'
import { beforeEach, describe, expect, it } from 'vitest'
import { CalendarFeedError } from '@orbit/application'
import {
  createInMemorySystem,
  createSqliteSystem,
  createSystem,
  createSqliteRepositories,
  type TestSystem,
} from './fixtures.ts'

const FEED = 'https://cal.example.com/private/secret-token-123/calendar.ics'
const OTHER = 'https://other.example.org/feed.ics?key=abc'
const MINUTE = 60 * 1000

const timed = (id: string, title: string, start: string, end: string): CalendarEvent => ({
  kind: 'timed',
  id,
  title,
  start,
  end,
  isOverride: false,
  isRecurring: false,
})

const allDay = (id: string, title: string, startDate: string, endDate: string): CalendarEvent => ({
  kind: 'all-day',
  id,
  title,
  startDate,
  endDate,
  isOverride: false,
  isRecurring: false,
})

/** The test clock starts at 2026-01-01T00:00:00Z, so the window is 2025-12-25 to 2026-03-04. */
const DAY = { from: new Date('2026-01-01T00:00:00Z'), to: new Date('2026-01-08T00:00:00Z') }

describe.each([
  ['in-memory', createInMemorySystem],
  ['sqlite', createSqliteSystem],
])('household calendars: %s', (_name, create) => {
  let sys: TestSystem
  let alice: Actor
  let bob: Actor
  let household: HouseholdId

  beforeEach(async () => {
    sys = create()
    alice = await sys.newActor('alice')
    bob = await sys.newActor('bob')
    household = (await sys.useCases.createHousehold(alice, { name: 'Home' })).id
    await sys.useCases.addHouseholdMember(alice, household, { userId: bob.userId })
    sys.calendarReader.feeds.set(FEED, [
      timed('a', 'Dentist', '2026-01-02T09:00:00.000Z', '2026-01-02T10:00:00.000Z'),
      allDay('b', 'Holiday', '2026-01-03', '2026-01-04'),
    ])
    sys.calendarReader.feeds.set(OTHER, [
      timed('c', 'Football', '2026-01-02T08:00:00.000Z', '2026-01-02T09:00:00.000Z'),
    ])
  })

  describe('sources', () => {
    it('keeps the secret address out of everything it returns', async () => {
      const source = await sys.calendar.addSource(alice, household, {
        name: 'Family',
        url: FEED,
        color: '#AA00FF',
      })
      expect(source).toMatchObject({ name: 'Family', host: 'cal.example.com', color: '#aa00ff' })
      const everything = JSON.stringify([
        source,
        await sys.calendar.listSources(alice, household),
        await sys.calendar.events(alice, household, DAY),
      ])
      expect(everything).not.toContain('secret-token-123')
    })

    it('accepts webcal:// as https', async () => {
      await sys.calendar.addSource(alice, household, {
        name: 'Family',
        url: 'webcal://cal.example.com/private/secret-token-123/calendar.ics',
      })
      expect(sys.calendarReader.calls).toContain(FEED)
    })

    it('lets a member see the sources but not change them', async () => {
      const source = await sys.calendar.addSource(alice, household, { name: 'A', url: FEED })
      expect(await sys.calendar.listSources(bob, household)).toHaveLength(1)
      await expect(
        sys.calendar.addSource(bob, household, { name: 'B', url: OTHER }),
      ).rejects.toBeInstanceOf(ForbiddenError)
      await expect(sys.calendar.removeSource(bob, household, source.id)).rejects.toBeInstanceOf(
        ForbiddenError,
      )
      expect(await sys.calendar.listSources(alice, household)).toHaveLength(1)
    })

    it.each([
      ['an empty address', ''],
      ['text that is not an address', 'not a url'],
      ['a file address', 'file:///etc/passwd'],
      ['an address with a password', 'https://user:pass@cal.example.com/a.ics'],
    ])('refuses %s', async (_label, url) => {
      sys.calendarReader.feeds.set(url, [])
      await expect(
        sys.calendar.addSource(alice, household, { name: 'Bad', url }),
      ).rejects.toBeInstanceOf(InvariantViolation)
      expect(await sys.calendar.listSources(alice, household)).toEqual([])
    })

    it('refuses a feed that cannot be read, and stores nothing', async () => {
      sys.calendarReader.feeds.set(
        FEED,
        new CalendarFeedError('The calendar server answered with status 403.'),
      )
      const error = await sys.calendar
        .addSource(alice, household, { name: 'Family', url: FEED })
        .catch((e: unknown) => e)
      expect(error).toBeInstanceOf(InvariantViolation)
      expect((error as Error).message).toContain('status 403')
      expect((error as Error).message).not.toContain('secret-token-123')
      expect(await sys.calendar.listSources(alice, household)).toEqual([])
    })

    it('refuses a bad name or color, and more than ten calendars', async () => {
      await expect(
        sys.calendar.addSource(alice, household, { name: ' ', url: FEED }),
      ).rejects.toBeInstanceOf(InvariantViolation)
      await expect(
        sys.calendar.addSource(alice, household, { name: 'A', url: FEED, color: 'red' }),
      ).rejects.toBeInstanceOf(InvariantViolation)
      for (let i = 0; i < 10; i += 1)
        await sys.calendar.addSource(alice, household, { name: `C${i}`, url: FEED })
      await expect(
        sys.calendar.addSource(alice, household, { name: 'Eleven', url: FEED }),
      ).rejects.toBeInstanceOf(InvariantViolation)
    })

    it('removes a source with its events', async () => {
      const source = await sys.calendar.addSource(alice, household, { name: 'A', url: FEED })
      expect((await sys.calendar.events(alice, household, DAY)).events).toHaveLength(2)
      await sys.calendar.removeSource(alice, household, source.id)
      expect(await sys.calendar.events(alice, household, DAY)).toEqual({ events: [], sources: [] })
      await expect(sys.calendar.removeSource(alice, household, source.id)).rejects.toBeInstanceOf(
        NotFoundError,
      )
    })

    it('does not find a source through another household', async () => {
      const source = await sys.calendar.addSource(alice, household, { name: 'A', url: FEED })
      const bobsHousehold = (await sys.useCases.createHousehold(bob, { name: 'Bobs' })).id
      await expect(sys.calendar.removeSource(bob, bobsHousehold, source.id)).rejects.toBeInstanceOf(
        NotFoundError,
      )
      await expect(
        sys.calendar.removeSource(bob, bobsHousehold, CalendarSourceId('missing')),
      ).rejects.toBeInstanceOf(NotFoundError)
      expect(await sys.calendar.listSources(alice, household)).toHaveLength(1)
    })
  })

  describe('events', () => {
    it('merges every source into one list, oldest first, tagged with its source', async () => {
      const a = await sys.calendar.addSource(alice, household, { name: 'Family', url: FEED })
      const b = await sys.calendar.addSource(alice, household, { name: 'Sport', url: OTHER })
      const { events, sources } = await sys.calendar.events(bob, household, DAY)
      expect(events.map((e) => [e.title, e.sourceId])).toEqual([
        ['Football', b.id],
        ['Dentist', a.id],
        ['Holiday', a.id],
      ])
      expect(sources.map((s) => s.ok)).toEqual([true, true])
    })

    it('returns only events that overlap the range', async () => {
      await sys.calendar.addSource(alice, household, { name: 'Family', url: FEED })
      const { events } = await sys.calendar.events(alice, household, {
        from: new Date('2026-01-03T00:00:00Z'),
        to: new Date('2026-01-04T00:00:00Z'),
      })
      expect(events.map((e) => e.title)).toEqual(['Holiday'])
    })

    it('refuses a range outside the window, or one that ends before it starts', async () => {
      await expect(
        sys.calendar.events(alice, household, {
          from: new Date('2025-01-01T00:00:00Z'),
          to: new Date('2025-02-01T00:00:00Z'),
        }),
      ).rejects.toBeInstanceOf(InvariantViolation)
      await expect(
        sys.calendar.events(alice, household, {
          from: new Date('2026-01-05T00:00:00Z'),
          to: new Date('2026-01-01T00:00:00Z'),
        }),
      ).rejects.toBeInstanceOf(InvariantViolation)
    })

    it('reads each feed once within the cache lifetime, and again after it', async () => {
      await sys.calendar.addSource(alice, household, { name: 'Family', url: FEED })
      sys.calendarReader.calls.length = 0
      await sys.calendar.events(alice, household, DAY)
      await sys.calendar.events(bob, household, DAY)
      expect(sys.calendarReader.calls).toHaveLength(1)
      sys.clock.advance(6 * MINUTE)
      await sys.calendar.events(alice, household, DAY)
      expect(sys.calendarReader.calls).toHaveLength(2)
    })

    it('reads a feed once when many requests arrive together', async () => {
      await sys.calendar.addSource(alice, household, { name: 'Family', url: FEED })
      sys.calendarReader.calls.length = 0
      await Promise.all([1, 2, 3, 4].map(() => sys.calendar.events(alice, household, DAY)))
      expect(sys.calendarReader.calls).toHaveLength(1)
    })

    it('keeps the last good events when a refresh fails, and says so', async () => {
      await sys.calendar.addSource(alice, household, { name: 'Family', url: FEED })
      const first = await sys.calendar.events(alice, household, DAY)
      expect(first.sources[0]).toMatchObject({ ok: true })
      sys.calendarReader.feeds.set(
        FEED,
        new CalendarFeedError('The calendar server answered with status 503.'),
      )
      sys.clock.advance(6 * MINUTE)
      const failed = await sys.calendar.events(alice, household, DAY)
      expect(failed.events.map((e) => e.title)).toEqual(['Dentist', 'Holiday'])
      expect(failed.sources[0]).toMatchObject({
        ok: false,
        error: 'The calendar server answered with status 503.',
        fetchedAt: first.sources[0]!.fetchedAt,
      })
      // And it recovers on the next successful read.
      sys.calendarReader.feeds.set(FEED, [
        timed('z', 'New', '2026-01-02T09:00:00.000Z', '2026-01-02T10:00:00.000Z'),
      ])
      sys.clock.advance(6 * MINUTE)
      const healed = await sys.calendar.events(alice, household, DAY)
      expect(healed.events.map((e) => e.title)).toEqual(['New'])
      expect(healed.sources[0]).toMatchObject({ ok: true })
    })

    it('does not leak an unexpected error message', async () => {
      await sys.calendar.addSource(alice, household, { name: 'Family', url: FEED })
      sys.calendarReader.feeds.set(FEED, new Error(`boom ${FEED}`))
      sys.clock.advance(6 * MINUTE)
      const { sources } = await sys.calendar.events(alice, household, DAY)
      expect(sources[0]).toMatchObject({ ok: false, error: 'The calendar could not be read.' })
      expect(JSON.stringify(sources)).not.toContain('secret-token-123')
    })

    it('shows an error for a source whose first read fails, with no events', async () => {
      await sys.calendar.addSource(alice, household, { name: 'Family', url: FEED })
      await sys.calendar.addSource(alice, household, { name: 'Sport', url: OTHER })
      sys.calendarReader.feeds.set(FEED, new CalendarFeedError('Down.'))
      sys.clock.advance(6 * MINUTE)
      const { events, sources } = await sys.calendar.events(alice, household, DAY)
      expect(events.map((e) => e.title)).toEqual(['Football'])
      expect(sources.map((s) => s.ok)).toEqual([false, true])
    })
  })

  describe('in a TRMNL feed', () => {
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

    it('answers from the cache and refreshes in the background', async () => {
      await sys.calendar.addSource(alice, household, { name: 'Family', url: FEED })
      const { token } = await sys.useCases.createFeed(alice, household, {
        name: 'Hall',
        fields: ['calendar.today', 'calendar.upcoming'],
      })
      sys.calendarReader.calls.length = 0
      // Nothing cached yet: the display must not wait for the calendar server.
      expect(await sys.feedReader.read(token)).toEqual({ calendar: { today: [], upcoming: [] } })
      await flush()
      expect(sys.calendarReader.calls).toHaveLength(1)
      // The next poll has data.
      expect(await sys.feedReader.read(token)).toEqual({
        calendar: {
          today: [],
          upcoming: [
            {
              title: 'Dentist',
              allDay: false,
              start: '2026-01-02T09:00:00.000Z',
              end: '2026-01-02T10:00:00.000Z',
            },
            { title: 'Holiday', allDay: true, start: '2026-01-03', end: '2026-01-04' },
          ],
        },
      })
      expect(sys.calendarReader.calls).toHaveLength(1)
    })

    it('publishes only the calendar fields that were chosen', async () => {
      await sys.calendar.addSource(alice, household, { name: 'Family', url: FEED })
      await sys.calendar.events(alice, household, DAY)
      const { token } = await sys.useCases.createFeed(alice, household, {
        name: 'Hall',
        fields: ['calendar.upcoming'],
      })
      const content = (await sys.feedReader.read(token)) as { calendar: Record<string, unknown> }
      expect(Object.keys(content.calendar)).toEqual(['upcoming'])
    })

    it("never shows another household's events", async () => {
      await sys.calendar.addSource(alice, household, { name: 'Family', url: FEED })
      await sys.calendar.events(alice, household, DAY)
      const carol = await sys.newActor('carol')
      const carols = (await sys.useCases.createHousehold(carol, { name: 'C' })).id
      const { token } = await sys.useCases.createFeed(carol, carols, {
        name: 'Hall',
        fields: ['calendar.today', 'calendar.upcoming'],
      })
      expect(await sys.feedReader.read(token)).toEqual({ calendar: { today: [], upcoming: [] } })
      await flush()
      expect(await sys.feedReader.read(token)).toEqual({ calendar: { today: [], upcoming: [] } })
    })

    it('decides what today is in the configured time zone', async () => {
      const copenhagen = createSystem(createSqliteRepositories(), {
        timeZone: 'Europe/Copenhagen',
      })
      const owner = await copenhagen.newActor('dora')
      const home = (await copenhagen.useCases.createHousehold(owner, { name: 'Hjem' })).id
      // 23:30 UTC on 1 January is 00:30 on 2 January in Copenhagen.
      copenhagen.calendarReader.feeds.set(FEED, [
        timed('late', 'Midnight snack', '2026-01-01T23:30:00.000Z', '2026-01-02T00:00:00.000Z'),
      ])
      await copenhagen.calendar.addSource(owner, home, { name: 'F', url: FEED })
      await copenhagen.calendar.events(owner, home, DAY)
      const { token } = await copenhagen.useCases.createFeed(owner, home, {
        name: 'Hall',
        fields: ['calendar.today', 'calendar.upcoming'],
      })
      expect(await copenhagen.feedReader.read(token)).toEqual({
        calendar: {
          today: [],
          upcoming: [
            {
              title: 'Midnight snack',
              allDay: false,
              start: '2026-01-01T23:30:00.000Z',
              end: '2026-01-02T00:00:00.000Z',
            },
          ],
        },
      })
    })
  })
})
