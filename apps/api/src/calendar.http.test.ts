import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestEnv, PASSWORD, type TestClient, type TestEnv } from './test-support.ts'

const V1 = '/api/v1'
const FEED = 'https://cal.example.com/private/very-secret-token/family.ics'
const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE

const ics = (...events: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', ...events, 'END:VCALENDAR'].join('\r\n')

const dentist = [
  'BEGIN:VEVENT',
  'UID:dentist@test',
  'DTSTAMP:20260101T000000Z',
  'DTSTART:20260102T090000Z',
  'DTEND:20260102T100000Z',
  'SUMMARY:Dentist',
  'LOCATION:Main Street 1',
  'END:VEVENT',
].join('\r\n')

const holiday = [
  'BEGIN:VEVENT',
  'UID:holiday@test',
  'DTSTAMP:20260101T000000Z',
  'DTSTART;VALUE=DATE:20260103',
  'DTEND;VALUE=DATE:20260104',
  'SUMMARY:Holiday',
  'END:VEVENT',
].join('\r\n')

// Saturdays at 09:00 in Copenhagen: the clocks go forward on 29 March 2026.
const weekly = [
  'BEGIN:VEVENT',
  'UID:swim@test',
  'DTSTAMP:20260101T000000Z',
  'DTSTART;TZID=Europe/Copenhagen:20260321T090000',
  'DTEND;TZID=Europe/Copenhagen:20260321T100000',
  'RRULE:FREQ=WEEKLY;COUNT=4',
  'SUMMARY:Swimming',
  'END:VEVENT',
].join('\r\n')

describe.each(['memory', 'sqlite'] as const)('household calendars over HTTP (%s)', (storage) => {
  let env: TestEnv
  let alice: TestClient
  let bob: TestClient
  let anon: TestClient
  let household: string

  const sources = () => `${V1}/households/${household}/calendar/sources`
  const events = (query = '') => `${V1}/households/${household}/calendar/events${query}`

  beforeEach(async () => {
    env = await createTestEnv({ storage })
    alice = env.client()
    bob = env.client()
    anon = env.client()
    await alice.signUp('alice')
    await bob.signUp('bobby')
    household = (await alice.post(`${V1}/households`, { name: 'Home' })).body.id
    await alice.post(`${V1}/households/${household}/members`, { username: 'bobby' })
    env.ics.feeds.set(FEED, ics(dentist, holiday))
  })
  afterEach(() => env.close())

  it('adds a calendar and never returns its address', async () => {
    const created = await alice.post(sources(), { name: 'Family', url: FEED, color: '#3366ff' })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({
      name: 'Family',
      color: '#3366ff',
      host: 'cal.example.com',
    })

    const everything = JSON.stringify([
      created.body,
      (await alice.get(sources())).body,
      (await bob.get(sources())).body,
      (await alice.get(events('?from=2026-01-01&to=2026-01-08'))).body,
      (await alice.get(`${V1}/openapi.json`)).body,
    ])
    expect(everything).not.toContain('very-secret-token')
  })

  it('returns merged, normalized events to any member', async () => {
    await alice.post(sources(), { name: 'Family', url: FEED })
    const res = await bob.get(events('?from=2026-01-01&to=2026-01-08'))
    expect(res.status).toBe(200)
    expect(res.body.events).toMatchObject([
      {
        kind: 'timed',
        title: 'Dentist',
        start: '2026-01-02T09:00:00.000Z',
        end: '2026-01-02T10:00:00.000Z',
        location: 'Main Street 1',
      },
      { kind: 'all-day', title: 'Holiday', startDate: '2026-01-03', endDate: '2026-01-04' },
    ])
    expect(res.body.sources).toMatchObject([{ ok: true }])
  })

  it('defaults to a week from the start of today', async () => {
    await alice.post(sources(), { name: 'Family', url: FEED })
    const res = await alice.get(events())
    expect(res.status).toBe(200)
    expect(res.body.events.map((e: { title: string }) => e.title)).toEqual(['Dentist', 'Holiday'])
  })

  it('lets only an owner add and remove calendars', async () => {
    const created = await alice.post(sources(), { name: 'Family', url: FEED })
    expect((await bob.post(sources(), { name: 'Mine', url: FEED })).status).toBe(403)
    expect((await bob.delete(`${sources()}/${created.body.id}`)).status).toBe(403)
    expect((await anon.get(sources())).status).toBe(401)
    expect((await alice.delete(`${sources()}/${created.body.id}`)).status).toBe(204)
    expect((await alice.get(sources())).body).toEqual({ sources: [] })
  })

  it('refuses a calendar it cannot read, with a message that hides the address', async () => {
    const res = await alice.post(sources(), {
      name: 'Gone',
      url: 'https://cal.example.com/private/another-secret/gone.ics',
    })
    expect(res.status).toBe(422)
    expect(res.body.detail).toContain('status 404')
    expect(JSON.stringify(res.body)).not.toContain('another-secret')
    expect((await alice.get(sources())).body).toEqual({ sources: [] })
  })

  it.each([
    ['not an address', 'nonsense'],
    ['a file address', 'file:///etc/passwd'],
    ['an address with a password', 'https://me:pw@cal.example.com/a.ics'],
  ])('refuses %s', async (_label, url) => {
    const res = await alice.post(sources(), { name: 'Bad', url })
    expect(res.status).toBe(422)
  })

  it('validates the request shape', async () => {
    expect((await alice.post(sources(), { name: '', url: FEED })).status).toBe(400)
    expect((await alice.post(sources(), { name: 'A', url: FEED, color: 'red' })).status).toBe(400)
    expect((await alice.post(sources(), { name: 'A', url: FEED, extra: 1 })).status).toBe(400)
    expect((await alice.get(events('?from=yesterday'))).status).toBe(400)
  })

  it('refuses a range outside the window', async () => {
    const res = await alice.get(events('?from=2020-01-01&to=2020-02-01'))
    expect(res.status).toBe(422)
  })

  it('explains that saving needs a secret key when the server has none', async () => {
    const bare = await createTestEnv({ storage, calendarSecrets: 'missing' })
    try {
      const owner = bare.client()
      await owner.signUp('olga')
      const id = (await owner.post(`${V1}/households`, { name: 'Home' })).body.id
      bare.ics.feeds.set(FEED, ics(dentist))
      const res = await owner.post(`${V1}/households/${id}/calendar/sources`, {
        name: 'Family',
        url: FEED,
      })
      expect(res.status).toBe(409)
      expect(res.body.detail).toContain('ORBIT_SECRET_KEY')
      expect((await owner.get(`${V1}/households/${id}/calendar/sources`)).body).toEqual({
        sources: [],
      })
    } finally {
      await bare.close()
    }
  })

  it('keeps showing the last good events when the calendar goes down', async () => {
    await alice.post(sources(), { name: 'Family', url: FEED })
    const query = '?from=2026-01-01&to=2026-01-08'
    expect((await alice.get(events(query))).body.events).toHaveLength(2)

    env.ics.feeds.delete(FEED)
    env.clock.advance(6 * MINUTE)
    const down = await alice.get(events(query))
    expect(down.status).toBe(200)
    expect(down.body.events).toHaveLength(2)
    expect(down.body.sources[0]).toMatchObject({
      ok: false,
      error: 'The calendar server answered with status 404.',
    })
    expect(JSON.stringify(down.body)).not.toContain('very-secret-token')
  })

  it('reads the calendar server at most once per cache lifetime', async () => {
    await alice.post(sources(), { name: 'Family', url: FEED })
    env.ics.requests.length = 0
    await alice.get(events())
    await bob.get(events())
    await alice.get(events('?from=2026-01-02&to=2026-01-04'))
    expect(env.ics.requests).toHaveLength(1)
  })

  describe('recurring events across the daylight saving change', () => {
    beforeEach(async () => {
      // Move the clock to 2 March so the window (a week back, 62 days ahead) covers the change.
      env.clock.advance(60 * DAY)
      // Sessions do not last that long.
      await alice.post(`${V1}/auth/login`, { username: 'alice', password: PASSWORD })
      env.ics.feeds.set(FEED, ics(weekly))
      await alice.post(sources(), { name: 'Swim', url: FEED })
    })

    it('keeps the local time and moves the UTC instant', async () => {
      const res = await alice.get(events('?from=2026-03-20&to=2026-04-20'))
      expect(res.status).toBe(200)
      expect(
        res.body.events.map((e: { start: string; end: string; timeZone?: string }) => [
          e.start,
          e.end,
          e.timeZone,
        ]),
      ).toEqual([
        ['2026-03-21T08:00:00.000Z', '2026-03-21T09:00:00.000Z', 'Europe/Copenhagen'],
        ['2026-03-28T08:00:00.000Z', '2026-03-28T09:00:00.000Z', 'Europe/Copenhagen'],
        // The clocks went forward on the night to 29 March: 09:00 local is now 07:00 UTC.
        ['2026-04-04T07:00:00.000Z', '2026-04-04T08:00:00.000Z', 'Europe/Copenhagen'],
        ['2026-04-11T07:00:00.000Z', '2026-04-11T08:00:00.000Z', 'Europe/Copenhagen'],
      ])
      expect(res.body.events.every((e: { isRecurring: boolean }) => e.isRecurring)).toBe(true)
    })

    it('returns only the occurrences inside the range', async () => {
      const res = await alice.get(events('?from=2026-03-29&to=2026-04-05'))
      expect(res.body.events.map((e: { start: string }) => e.start)).toEqual([
        '2026-04-04T07:00:00.000Z',
      ])
    })
  })
})
