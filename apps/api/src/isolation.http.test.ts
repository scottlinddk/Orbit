import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PUBLIC_OPERATIONS } from './public-operations.ts'
import { createTestEnv, createTestPlanets, type TestClient, type TestEnv } from './test-support.ts'

/**
 * The household-isolation kit, re-run through HTTP. Routes can bypass use cases, so the
 * invariant has to hold here too: another household's resources answer 404, byte-for-byte
 * the same as a resource that does not exist, and members are limited to what their role allows.
 *
 * Every protected operation in the OpenAPI document must appear in `cases` or in `NO_FOREIGN_ID`.
 * A new route without an entry fails the "covers every operation" test.
 */

interface Ids {
  household: string
  dashboard: string
  widget: string
  /** A placement of an installed Planet, rendered by the Planet route. */
  planetWidget: string
  invitation: string
  feed: string
  alice: string
}

interface Case {
  /** Same key as in the OpenAPI document: "<method> <path>". */
  key: string
  call: (c: TestClient, ids: Ids) => ReturnType<TestClient['get']>
  /** The same call aimed at an id that does not exist. */
  callMissing: (c: TestClient) => ReturnType<TestClient['get']>
  /** Whether a plain member (not owner) is allowed. */
  memberAllowed: boolean
}

const V1 = '/api/v1'
const GONE = 'does-not-exist'

const cases: Case[] = [
  {
    key: 'get /api/v1/households/{householdId}',
    call: (c, i) => c.get(`${V1}/households/${i.household}`),
    callMissing: (c) => c.get(`${V1}/households/${GONE}`),
    memberAllowed: true,
  },
  {
    key: 'post /api/v1/households/{householdId}/members',
    call: (c, i) => c.post(`${V1}/households/${i.household}/members`, { username: 'carol' }),
    callMissing: (c) => c.post(`${V1}/households/${GONE}/members`, { username: 'carol' }),
    memberAllowed: false,
  },
  {
    key: 'delete /api/v1/households/{householdId}/members/{userId}',
    call: (c, i) => c.delete(`${V1}/households/${i.household}/members/${i.alice}`),
    callMissing: (c) => c.delete(`${V1}/households/${GONE}/members/${GONE}`),
    memberAllowed: false,
  },
  {
    key: 'post /api/v1/households/{householdId}/invitations',
    call: (c, i) => c.post(`${V1}/households/${i.household}/invitations`, { role: 'owner' }),
    callMissing: (c) => c.post(`${V1}/households/${GONE}/invitations`, { role: 'owner' }),
    memberAllowed: false,
  },
  {
    key: 'get /api/v1/households/{householdId}/invitations',
    call: (c, i) => c.get(`${V1}/households/${i.household}/invitations`),
    callMissing: (c) => c.get(`${V1}/households/${GONE}/invitations`),
    memberAllowed: false,
  },
  {
    key: 'delete /api/v1/households/{householdId}/invitations/{invitationId}',
    call: (c, i) => c.delete(`${V1}/households/${i.household}/invitations/${i.invitation}`),
    callMissing: (c) => c.delete(`${V1}/households/${GONE}/invitations/${GONE}`),
    memberAllowed: false,
  },
  {
    key: 'post /api/v1/households/{householdId}/feeds',
    call: (c, i) =>
      c.post(`${V1}/households/${i.household}/feeds`, { name: 'Spy', fields: ['household.name'] }),
    callMissing: (c) =>
      c.post(`${V1}/households/${GONE}/feeds`, { name: 'Spy', fields: ['household.name'] }),
    memberAllowed: false,
  },
  {
    key: 'get /api/v1/households/{householdId}/feeds',
    call: (c, i) => c.get(`${V1}/households/${i.household}/feeds`),
    callMissing: (c) => c.get(`${V1}/households/${GONE}/feeds`),
    memberAllowed: false,
  },
  {
    key: 'delete /api/v1/households/{householdId}/feeds/{feedId}',
    call: (c, i) => c.delete(`${V1}/households/${i.household}/feeds/${i.feed}`),
    callMissing: (c) => c.delete(`${V1}/households/${GONE}/feeds/${GONE}`),
    memberAllowed: false,
  },
  {
    key: 'get /api/v1/households/{householdId}/dashboards',
    call: (c, i) => c.get(`${V1}/households/${i.household}/dashboards`),
    callMissing: (c) => c.get(`${V1}/households/${GONE}/dashboards`),
    memberAllowed: true,
  },
  {
    key: 'post /api/v1/households/{householdId}/dashboards',
    call: (c, i) => c.post(`${V1}/households/${i.household}/dashboards`, { name: 'Intruder' }),
    callMissing: (c) => c.post(`${V1}/households/${GONE}/dashboards`, { name: 'Intruder' }),
    memberAllowed: false,
  },
  {
    key: 'get /api/v1/dashboards/{dashboardId}',
    call: (c, i) => c.get(`${V1}/dashboards/${i.dashboard}`),
    callMissing: (c) => c.get(`${V1}/dashboards/${GONE}`),
    memberAllowed: true,
  },
  {
    key: 'delete /api/v1/dashboards/{dashboardId}',
    call: (c, i) => c.delete(`${V1}/dashboards/${i.dashboard}`),
    callMissing: (c) => c.delete(`${V1}/dashboards/${GONE}`),
    memberAllowed: false,
  },
  {
    key: 'put /api/v1/dashboards/{dashboardId}/name',
    call: (c, i) => c.put(`${V1}/dashboards/${i.dashboard}/name`, { name: 'Hacked' }),
    callMissing: (c) => c.put(`${V1}/dashboards/${GONE}/name`, { name: 'Hacked' }),
    memberAllowed: false,
  },
  {
    key: 'put /api/v1/dashboards/{dashboardId}/columns',
    call: (c, i) => c.put(`${V1}/dashboards/${i.dashboard}/columns`, { columns: 1 }),
    callMissing: (c) => c.put(`${V1}/dashboards/${GONE}/columns`, { columns: 1 }),
    memberAllowed: false,
  },
  {
    key: 'post /api/v1/dashboards/{dashboardId}/widgets',
    call: (c, i) => c.post(`${V1}/dashboards/${i.dashboard}/widgets`, { type: 'lists.shopping' }),
    callMissing: (c) => c.post(`${V1}/dashboards/${GONE}/widgets`, { type: 'lists.shopping' }),
    memberAllowed: false,
  },
  {
    key: 'delete /api/v1/dashboards/{dashboardId}/widgets/{widgetId}',
    call: (c, i) => c.delete(`${V1}/dashboards/${i.dashboard}/widgets/${i.widget}`),
    callMissing: (c) => c.delete(`${V1}/dashboards/${GONE}/widgets/${GONE}`),
    memberAllowed: false,
  },
  {
    key: 'get /api/v1/dashboards/{dashboardId}/widgets/{widgetId}/planet',
    call: (c, i) => c.get(`${V1}/dashboards/${i.dashboard}/widgets/${i.planetWidget}/planet`),
    callMissing: (c) => c.get(`${V1}/dashboards/${GONE}/widgets/${GONE}/planet`),
    memberAllowed: true,
  },
  {
    key: 'put /api/v1/dashboards/{dashboardId}/widgets/{widgetId}/position',
    call: (c, i) =>
      c.put(`${V1}/dashboards/${i.dashboard}/widgets/${i.widget}/position`, { toIndex: 0 }),
    callMissing: (c) => c.put(`${V1}/dashboards/${GONE}/widgets/${GONE}/position`, { toIndex: 0 }),
    memberAllowed: false,
  },
  {
    key: 'put /api/v1/dashboards/{dashboardId}/widgets/{widgetId}/span',
    call: (c, i) => c.put(`${V1}/dashboards/${i.dashboard}/widgets/${i.widget}/span`, { span: 2 }),
    callMissing: (c) => c.put(`${V1}/dashboards/${GONE}/widgets/${GONE}/span`, { span: 2 }),
    memberAllowed: false,
  },
  {
    key: 'put /api/v1/dashboards/{dashboardId}/widgets/{widgetId}/config',
    call: (c, i) =>
      c.put(`${V1}/dashboards/${i.dashboard}/widgets/${i.widget}/config`, { config: { a: 1 } }),
    callMissing: (c) => c.put(`${V1}/dashboards/${GONE}/widgets/${GONE}/config`, { config: {} }),
    memberAllowed: false,
  },
]

/** Protected operations that take no id belonging to anyone else. They are covered by 401 tests. */
const NO_FOREIGN_ID = new Set([
  'post /api/v1/auth/logout',
  'get /api/v1/auth/me',
  'get /api/v1/households',
  'post /api/v1/households',
  'get /api/v1/planets/widgets',
])

describe.each(['memory', 'sqlite'] as const)('household isolation over HTTP (%s)', (storage) => {
  let env: TestEnv
  let alice: TestClient, bob: TestClient, carol: TestClient, anon: TestClient
  let ids: Ids

  beforeEach(async () => {
    env = await createTestEnv({ storage, planets: createTestPlanets() })
    alice = env.client()
    bob = env.client()
    carol = env.client()
    anon = env.client()
    const aliceUser = await alice.signUp('alice')
    await bob.signUp('bobby')
    await carol.signUp('carol')

    const household = (await alice.post(`${V1}/households`, { name: 'A' })).body.id
    await alice.post(`${V1}/households/${household}/members`, { username: 'bobby' })
    await carol.post(`${V1}/households`, { name: 'B' })
    const dashboard = (
      await alice.post(`${V1}/households/${household}/dashboards`, { name: 'Family' })
    ).body
    const withWidget = (
      await alice.post(`${V1}/dashboards/${dashboard.id}/widgets`, { type: 'calendar.agenda' })
    ).body
    const withPlanet = (
      await alice.post(`${V1}/dashboards/${dashboard.id}/widgets`, {
        type: 'planet.dev.test.static',
      })
    ).body
    const invitation = (await alice.post(`${V1}/households/${household}/invitations`)).body
    const feed = (
      await alice.post(`${V1}/households/${household}/feeds`, {
        name: 'Kitchen',
        fields: ['household.name'],
      })
    ).body
    ids = {
      household,
      invitation: invitation.id,
      feed: feed.id,
      dashboard: dashboard.id,
      widget: withWidget.widgets[0].id,
      planetWidget: withPlanet.widgets.at(-1).id,
      alice: aliceUser.id,
    }
  })
  afterEach(() => env.close())

  const state = async () => ({
    household: (await alice.get(`${V1}/households/${ids.household}`)).body,
    dashboards: (await alice.get(`${V1}/households/${ids.household}/dashboards`)).body,
    invitations: (await alice.get(`${V1}/households/${ids.household}/invitations`)).body,
    feeds: (await alice.get(`${V1}/households/${ids.household}/feeds`)).body,
  })

  it('covers every protected operation in the OpenAPI document', async () => {
    const spec = (await anon.get(`${V1}/openapi.json`)).body
    const documented = Object.entries<any>(spec.paths).flatMap(([path, item]) =>
      Object.keys(item).map((method) => `${method} ${path}`),
    )
    const covered = new Set([...cases.map((c) => c.key), ...NO_FOREIGN_ID, ...PUBLIC_OPERATIONS])
    const missing = documented.filter((key) => !covered.has(key))
    expect(missing, 'add these to the isolation cases').toEqual([])
    for (const c of cases) expect(documented, c.key).toContain(c.key)
  })

  describe.each(cases)('$key', (c) => {
    it('is rejected without a session', async () => {
      const res = await c.call(anon, ids)
      expect(res.status).toBe(401)
    })

    it('answers an outsider exactly like a missing resource, and changes nothing', async () => {
      const before = await state()
      const outsider = await c.call(carol, ids)
      const missing = await c.callMissing(carol)
      expect(outsider.status).toBe(404)
      expect(outsider.body).toEqual(missing.body)
      expect(await state()).toEqual(before)
    })

    it(
      c.memberAllowed ? 'allows a plain member' : 'forbids a plain member and changes nothing',
      async () => {
        const before = await state()
        const res = await c.call(bob, ids)
        if (c.memberAllowed) {
          expect(res.status).toBe(200)
        } else {
          expect(res.status).toBe(403)
          expect(await state()).toEqual(before)
        }
      },
    )
  })

  it('stops serving a removed member immediately', async () => {
    const bobId = (await bob.get(`${V1}/auth/me`)).body.id
    expect((await bob.get(`${V1}/dashboards/${ids.dashboard}`)).status).toBe(200)
    await alice.delete(`${V1}/households/${ids.household}/members/${bobId}`)
    expect((await bob.get(`${V1}/dashboards/${ids.dashboard}`)).status).toBe(404)
  })

  it('never lists another household in your own listings', async () => {
    const mine = (await carol.get(`${V1}/households`)).body.households
    expect(mine.map((h: { id: string }) => h.id)).not.toContain(ids.household)
  })

  it('does not reveal whether a username exists to a non-owner trying to add it', async () => {
    const known = await bob.post(`${V1}/households/${ids.household}/members`, { username: 'carol' })
    const unknown = await bob.post(`${V1}/households/${ids.household}/members`, {
      username: 'zzzzz',
    })
    expect(known.status).toBe(403)
    expect(unknown.body).toEqual(known.body)
  })
})
