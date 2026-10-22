import { FEED_FIELDS } from '@orbit/domain'
import { feedFieldSchema } from '@orbit/contracts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestEnv, type TestClient, type TestEnv } from './test-support.ts'

const V1 = '/api/v1'

describe.each(['memory', 'sqlite'] as const)('display feed over HTTP (%s)', (storage) => {
  let env: TestEnv
  let alice: TestClient
  let carol: TestClient
  let anon: TestClient
  let householdA: string
  let householdB: string
  let dashboardA: string
  let nowMs = 0

  const bearer = (token: string) => ({ authorization: `Bearer ${token}` })
  const createFeed = async (
    as: TestClient,
    household: string,
    body: object = { name: 'Kitchen', fields: ['household.name'] },
  ) => {
    const res = await as.post(`${V1}/households/${household}/feeds`, body)
    expect(res.status).toBe(201)
    return res.body as { id: string; token: string }
  }

  beforeEach(async () => {
    nowMs = 1_000_000
    env = await createTestEnv({
      storage,
      app: {
        feedRateLimit: {
          now: () => nowMs,
          windowMs: 60_000,
          perToken: 5,
          perClient: 8,
          failuresPerClient: 3,
        },
      },
    })
    alice = env.client()
    carol = env.client()
    anon = env.client()
    await alice.signUp('alice')
    await carol.signUp('carol')
    householdA = (await alice.post(`${V1}/households`, { name: 'Home A' })).body.id
    householdB = (await carol.post(`${V1}/households`, { name: 'Home B' })).body.id
    dashboardA = (await alice.post(`${V1}/households/${householdA}/dashboards`, { name: 'Wall' }))
      .body.id
    await alice.post(`${V1}/dashboards/${dashboardA}/widgets`, {
      type: 'calendar.agenda',
      config: { secretRef: 'do-not-leak' },
    })
  })
  afterEach(() => env.close())

  it('keeps the contract field list equal to the domain allowlist', () => {
    expect([...feedFieldSchema.options]).toEqual([...FEED_FIELDS])
  })

  it('creates, reads and revokes a feed', async () => {
    const feed = await createFeed(alice, householdA)
    expect(feed.token).toBeTruthy()

    const read = await anon.get(`${V1}/feed`, bearer(feed.token))
    expect(read.status).toBe(200)
    expect(read.body).toEqual({ household: { name: 'Home A' } })

    // The secret is shown once: listings never carry it.
    const listed = (await alice.get(`${V1}/households/${householdA}/feeds`)).body.feeds
    expect(listed).toHaveLength(1)
    expect(JSON.stringify(listed)).not.toContain(feed.token)

    expect((await alice.delete(`${V1}/households/${householdA}/feeds/${feed.id}`)).status).toBe(204)
    expect((await anon.get(`${V1}/feed`, bearer(feed.token))).status).toBe(404)
    expect((await alice.get(`${V1}/households/${householdA}/feeds`)).body.feeds).toEqual([])
  })

  it('publishes only the allowlisted fields and never widget configuration', async () => {
    const narrow = await createFeed(alice, householdA, {
      name: 'Narrow',
      fields: ['dashboard.name'],
      dashboardId: dashboardA,
    })
    const wide = await createFeed(alice, householdA, {
      name: 'Wide',
      fields: ['household.name', 'dashboard.widgets'],
      dashboardId: dashboardA,
    })
    expect((await anon.get(`${V1}/feed`, bearer(narrow.token))).body).toEqual({
      dashboard: { name: 'Wall' },
    })
    const wideRead = await anon.get(`${V1}/feed`, bearer(wide.token))
    expect(wideRead.body).toEqual({
      household: { name: 'Home A' },
      dashboard: { widgets: [{ type: 'calendar.agenda', span: 1 }] },
    })
    expect(wideRead.raw.body).not.toContain('do-not-leak')
  })

  it('rejects unknown fields and a missing dashboard', async () => {
    const unknown = await alice.post(`${V1}/households/${householdA}/feeds`, {
      name: 'x',
      fields: ['widget.config'],
    })
    expect(unknown.status).toBe(400)
    const noDashboard = await alice.post(`${V1}/households/${householdA}/feeds`, {
      name: 'x',
      fields: ['dashboard.name'],
    })
    expect(noDashboard.status).toBe(422)
  })

  it("does not let a token from household A read household B's data", async () => {
    const a = await createFeed(alice, householdA)
    const b = await createFeed(carol, householdB)
    expect((await anon.get(`${V1}/feed`, bearer(a.token))).body).toEqual({
      household: { name: 'Home A' },
    })
    expect((await anon.get(`${V1}/feed`, bearer(b.token))).body).toEqual({
      household: { name: 'Home B' },
    })
  })

  it("will not publish another household's dashboard", async () => {
    const foreign = await carol.post(`${V1}/households/${householdB}/feeds`, {
      name: 'Spy',
      fields: ['dashboard.name'],
      dashboardId: dashboardA,
    })
    const missing = await carol.post(`${V1}/households/${householdB}/feeds`, {
      name: 'Spy',
      fields: ['dashboard.name'],
      dashboardId: 'does-not-exist',
    })
    expect(foreign.status).toBe(404)
    expect(foreign.body).toEqual(missing.body)
  })

  it('answers every bad token with the same 404, byte for byte', async () => {
    const feed = await createFeed(alice, householdA)
    await alice.delete(`${V1}/households/${householdA}/feeds/${feed.id}`)
    const attempts = [
      () => anon.get(`${V1}/feed`),
      () => anon.get(`${V1}/feed`, { authorization: 'Basic abc' }),
      () => anon.get(`${V1}/feed`, { authorization: 'Bearer ' }),
      () => anon.get(`${V1}/feed`, bearer('x'.repeat(500))),
    ]
    // One per client window: failures from the same address are limited, so space them out.
    const bodies: string[] = []
    for (const attempt of attempts) {
      const res = await attempt()
      expect(res.status).toBe(404)
      bodies.push(res.raw.body)
      nowMs += 60_000
    }
    const revoked = await anon.get(`${V1}/feed`, bearer(feed.token))
    nowMs += 60_000
    const unknown = await anon.get(`${V1}/feed`, bearer('never-issued'))
    expect(revoked.status).toBe(404)
    expect(revoked.raw.body).toBe(unknown.raw.body)
    for (const body of bodies) expect(body).toBe(unknown.raw.body)
    // Presenting a session cookie instead of a token gets nothing either.
    expect((await alice.get(`${V1}/feed`)).status).toBe(404)
  })

  it('rate limits guessing from one address, even though every guess is a 404', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 5; i++)
      statuses.push((await anon.get(`${V1}/feed`, bearer(`guess-${i}`))).status)
    expect(statuses).toEqual([404, 404, 404, 429, 429])
    // A valid token from the same address is also held back while the window lasts.
    const feed = await createFeed(alice, householdA)
    expect((await anon.get(`${V1}/feed`, bearer(feed.token))).status).toBe(429)
    nowMs += 60_000
    expect((await anon.get(`${V1}/feed`, bearer(feed.token))).status).toBe(200)
  })

  it('rate limits a single token', async () => {
    const feed = await createFeed(alice, householdA)
    const statuses: number[] = []
    for (let i = 0; i < 7; i++)
      statuses.push((await anon.get(`${V1}/feed`, bearer(feed.token))).status)
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429, 429])
    nowMs += 60_000
    expect((await anon.get(`${V1}/feed`, bearer(feed.token))).status).toBe(200)
  })

  it('supports conditional requests with an ETag', async () => {
    const feed = await createFeed(alice, householdA)
    const first = await anon.get(`${V1}/feed`, bearer(feed.token))
    const etag = first.headers.etag as string
    expect(etag).toBeTruthy()
    const again = await anon.get(`${V1}/feed`, { ...bearer(feed.token), 'if-none-match': etag })
    expect(again.status).toBe(304)
    expect(again.raw.body).toBe('')
    const changed = await alice.put(`${V1}/dashboards/${dashboardA}/name`, { name: 'Renamed' })
    expect(changed.status).toBe(200)
    const dashFeed = await createFeed(alice, householdA, {
      name: 'D',
      fields: ['dashboard.name'],
      dashboardId: dashboardA,
    })
    const before = (await anon.get(`${V1}/feed`, bearer(dashFeed.token))).headers.etag
    await alice.put(`${V1}/dashboards/${dashboardA}/name`, { name: 'Renamed again' })
    const after = (await anon.get(`${V1}/feed`, bearer(dashFeed.token))).headers.etag
    expect(after).not.toBe(before)
  })

  it('never puts the token in a header other than the one it came in, and does not cache it publicly', async () => {
    const feed = await createFeed(alice, householdA)
    const res = await anon.get(`${V1}/feed`, bearer(feed.token))
    expect(res.headers['cache-control']).toBe('private, no-cache')
    expect(JSON.stringify(res.headers)).not.toContain(feed.token)
  })
})
