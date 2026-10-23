import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createGuardedFetcher } from '@orbit/adapter-egress-guard'
import { createHomeAssistantProvider } from '@orbit/integration-home-assistant'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestEnv, type TestClient, type TestEnv } from './test-support.ts'

const V1 = '/api/v1'
const HA_URL = 'http://ha.local:8123'
const TOKEN = 'ha-token-very-secret'

describe.each(['memory', 'sqlite'] as const)('connections over HTTP (%s)', (storage) => {
  let env: TestEnv
  let alice: TestClient
  let bob: TestClient
  let household: string

  beforeEach(async () => {
    env = await createTestEnv({ storage })
    alice = env.client()
    bob = env.client()
    await alice.signUp('alice')
    await bob.signUp('bobby')
    household = (await alice.post(`${V1}/households`, { name: 'Home' })).body.id
    await alice.post(`${V1}/households/${household}/members`, { username: 'bobby' })
    const ha = env.integrations.add(HA_URL, TOKEN)
    ha.entities.push(
      { entityId: 'calendar.family', role: 'calendar', name: 'Family' },
      { entityId: 'todo.shopping', role: 'todo', name: 'Shopping' },
    )
    const tomorrow = new Date(env.clock.now().getTime() + 24 * 60 * 60 * 1000).toISOString()
    ha.calendars.set('calendar.family', [
      {
        kind: 'timed',
        id: 'e1',
        title: 'Dentist',
        start: tomorrow,
        end: tomorrow,
        isOverride: false,
        isRecurring: false,
      },
    ])
    ha.todos.set('todo.shopping', {
      id: 'todo.shopping',
      name: 'Shopping',
      items: [{ id: 'i1', title: 'Milk', completed: false }],
    })
  })
  afterEach(() => env.close())

  const base = () => `${V1}/households/${household}/connections`
  const connect = async () =>
    alice.post(base(), { kind: 'homeassistant', name: 'Home Assistant', url: HA_URL, token: TOKEN })

  it('walks through connect, choose, show and remove', async () => {
    const created = await connect()
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({
      kind: 'homeassistant',
      name: 'Home Assistant',
      host: 'ha.local:8123',
      mirrors: [],
    })
    const id = created.body.id

    const test = await alice.post(`${base()}/${id}/test`)
    expect(test.body).toEqual({
      ok: true,
      calendars: 1,
      todoLists: 1,
      mealPlans: 0,
      stockViews: 0,
    })

    const entities = await alice.get(`${base()}/${id}/entities`)
    expect(entities.body.entities).toEqual([
      { entityId: 'calendar.family', role: 'calendar', name: 'Family', mirrored: false },
      { entityId: 'todo.shopping', role: 'todo', name: 'Shopping', mirrored: false },
    ])

    const chosen = await alice.put(`${base()}/${id}/mirrors`, {
      entityIds: ['calendar.family', 'todo.shopping'],
    })
    expect(chosen.status).toBe(200)
    expect(chosen.body.mirrors).toHaveLength(2)

    // Everyone in the household sees what was mirrored, without learning about the connection.
    const events = await bob.get(`${V1}/households/${household}/calendar/events`)
    expect(events.body.events).toMatchObject([
      { title: 'Dentist', sourceId: `${id}:calendar.family` },
    ])
    expect(events.body.sources).toMatchObject([{ name: 'Family', ok: true }])
    const lists = await bob.get(`${V1}/households/${household}/lists`)
    expect(lists.body.lists).toMatchObject([
      { name: 'Shopping', readOnly: true, source: 'homeassistant', openCount: 1, itemCount: 1 },
    ])
    expect((await bob.get(base())).status).toBe(403)

    expect((await alice.delete(`${base()}/${id}`)).status).toBe(204)
    expect((await alice.get(base())).body.connections).toEqual([])
    expect((await bob.get(`${V1}/households/${household}/lists`)).body.lists).toEqual([])
  })

  it('never returns the address or the token, in any response or in the API document', async () => {
    const created = await connect()
    const id = created.body.id
    await alice.put(`${base()}/${id}/mirrors`, { entityIds: ['calendar.family', 'todo.shopping'] })
    const responses = [
      created,
      await alice.get(base()),
      await alice.post(`${base()}/${id}/test`),
      await alice.get(`${base()}/${id}/entities`),
      await alice.get(`${V1}/households/${household}`),
      await bob.get(`${V1}/households/${household}/calendar/events`),
      await bob.get(`${V1}/households/${household}/lists`),
      await anonymousSpec(),
    ]
    const everything = JSON.stringify(responses.map((r) => [r.body, r.headers]))
    expect(everything).not.toContain(TOKEN)
    expect(everything).not.toContain(HA_URL)
  })

  async function anonymousSpec() {
    return env.client().get(`${V1}/openapi.json`)
  }

  it('refuses a wrong token with a reason that does not repeat it', async () => {
    const res = await alice.post(base(), {
      kind: 'homeassistant',
      name: 'Bad',
      url: HA_URL,
      token: 'wrong-token-1234',
    })
    expect(res.status).toBe(422)
    expect(res.body.detail).toMatch(/refused the access token/)
    expect(JSON.stringify(res.body)).not.toContain('wrong-token-1234')
    expect((await alice.get(base())).body.connections).toEqual([])
  })

  it('refuses writes to a mirrored list as read only', async () => {
    const id = (await connect()).body.id
    await alice.put(`${base()}/${id}/mirrors`, { entityIds: ['todo.shopping'] })
    const listUrl = `${V1}/households/${household}/lists/${id}:todo.shopping`
    expect((await bob.get(listUrl)).body).toMatchObject({ readOnly: true, name: 'Shopping' })
    const rejected = await bob.post(`${listUrl}/items`, { text: 'Eggs' })
    expect(rejected.status).toBe(422)
    expect(rejected.body.detail).toMatch(/read only/)
    expect((await bob.patch(`${listUrl}/items/i1`, { done: true })).status).toBe(422)
    expect((await bob.delete(listUrl)).status).toBe(422)
  })

  it('says which setting is missing when the server has no secret key', async () => {
    const without = await createTestEnv({ storage, calendarSecrets: 'missing' })
    try {
      without.integrations.add(HA_URL, TOKEN)
      const owner = without.client()
      await owner.signUp('olga')
      const home = (await owner.post(`${V1}/households`, { name: 'H' })).body.id
      const res = await owner.post(`${V1}/households/${home}/connections`, {
        kind: 'homeassistant',
        name: 'HA',
        url: HA_URL,
        token: TOKEN,
      })
      expect(res.status).toBe(409)
      expect(res.body.detail).toMatch(/ORBIT_SECRET_KEY/)
    } finally {
      await without.close()
    }
  })

  it('rejects an unknown kind and a body with extra fields', async () => {
    expect(
      (await alice.post(base(), { kind: 'plex', name: 'x', url: HA_URL, token: TOKEN })).status,
    ).toBe(400)
    expect(
      (
        await alice.post(base(), {
          kind: 'homeassistant',
          name: 'x',
          url: HA_URL,
          token: TOKEN,
          extra: true,
        })
      ).status,
    ).toBe(400)
  })
})

describe('connections through the real provider and egress guard', () => {
  let server: Server
  let address: string
  let env: TestEnv | undefined

  beforeEach(async () => {
    server = createServer((req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(req.url?.startsWith('/api/states') ? '[]' : '[]')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    address = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterEach(async () => {
    await env?.close()
    await new Promise((resolve) => server.close(resolve))
  })

  async function connectTo(allowPrivate: string[]) {
    env = await createTestEnv({
      connectionProviders: [
        createHomeAssistantProvider(
          createGuardedFetcher({ allowPrivateHosts: new Set(allowPrivate) }),
        ),
      ],
    })
    const owner = env.client()
    await owner.signUp('olga')
    const home = (await owner.post(`${V1}/households`, { name: 'H' })).body.id
    const res = await owner.post(`${V1}/households/${home}/connections`, {
      kind: 'homeassistant',
      name: 'HA',
      url: address,
      token: TOKEN,
    })
    return { res, owner, home }
  }

  it('refuses a private address unless the operator allowed that host', async () => {
    const { res, owner, home } = await connectTo([])
    expect(res.status).toBe(422)
    expect(res.body.detail).toMatch(/ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS/)
    expect(JSON.stringify(res.body)).not.toContain(TOKEN)
    expect((await owner.get(`${V1}/households/${home}/connections`)).body.connections).toEqual([])
  })

  it('connects once the operator allowed the host', async () => {
    const { res } = await connectTo(['127.0.0.1'])
    expect(res.status).toBe(201)
    expect(res.body.host).toBe(address.replace('http://', ''))
  })
})
