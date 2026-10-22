import { createHmac, timingSafeEqual } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestEnv, type TestClient, type TestEnv } from './test-support.ts'

const V1 = '/api/v1'
const HOOK = 'https://hooks.example.com/services/T000/B000/secret-token'

describe.each(['memory', 'sqlite'] as const)('notification webhooks over HTTP (%s)', (storage) => {
  let env: TestEnv
  let alice: TestClient
  let bob: TestClient
  let household: string
  let base: string

  beforeEach(async () => {
    env = await createTestEnv({ storage })
    alice = env.client()
    bob = env.client()
    await alice.signUp('alice')
    await bob.signUp('bobby')
    household = (await alice.post(`${V1}/households`, { name: 'Home' })).body.id
    await alice.post(`${V1}/households/${household}/members`, { username: 'bobby' })
    base = `${V1}/households/${household}/notifications/endpoints`
  })
  afterEach(() => env.close())

  const create = async (events = ['list.item.added'], extra: Record<string, unknown> = {}) =>
    alice.post(base, { name: 'Chat', url: HOOK, events, ...extra })

  describe('secrecy', () => {
    it('shows the signing secret once and the address never', async () => {
      const created = await create()
      expect(created.status).toBe(201)
      expect(created.body).toMatchObject({
        name: 'Chat',
        host: 'hooks.example.com',
        events: ['list.item.added'],
        leadMinutes: 15,
        enabled: true,
        failures: 0,
      })
      expect(created.body.signingSecret).toMatch(/^[0-9a-f]{64}$/)
      expect(JSON.stringify(created.body)).not.toContain('secret-token')

      const everywhere = JSON.stringify([
        (await alice.get(base)).body,
        (await alice.get(`${base}/${created.body.id}/deliveries`)).body,
        (await alice.post(`${base}/${created.body.id}/test`)).body,
        (await alice.patch(`${base}/${created.body.id}`, { name: 'Renamed' })).body,
      ])
      expect(everywhere).not.toContain(created.body.signingSecret)
      expect(everywhere).not.toContain('secret-token')
      expect(everywhere).not.toContain('/services/')
    })

    it('never puts an address or secret in the OpenAPI document', async () => {
      const created = await create()
      const spec = JSON.stringify((await alice.get(`${V1}/openapi.json`)).body)
      expect(spec).not.toContain(created.body.signingSecret)
      expect(spec).not.toContain('secret-token')
      // The create response is the only one that carries a secret, and it is documented as such.
      expect(spec).toContain('signingSecret')
    })

    it('does not leak the address when a delivery fails', async () => {
      const created = await create()
      env.webhooks.reply(HOOK, 500)
      const test = await alice.post(`${base}/${created.body.id}/test`)
      expect(test.body).toMatchObject({ outcome: 'failed', httpStatus: 500 })
      expect(JSON.stringify(test.body)).not.toContain('hooks.example.com')
    })

    it('says plainly when the server has no secret key', async () => {
      await env.close()
      env = await createTestEnv({ storage, calendarSecrets: 'missing' })
      alice = env.client()
      await alice.signUp('alice')
      const id = (await alice.post(`${V1}/households`, { name: 'Home' })).body.id
      const res = await alice.post(`${V1}/households/${id}/notifications/endpoints`, {
        name: 'Chat',
        url: HOOK,
        events: ['list.item.added'],
      })
      expect(res.status).toBe(409)
      expect(JSON.stringify(res.body)).toContain('ORBIT_SECRET_KEY')
      expect((await alice.get(`${V1}/households/${id}/notifications/endpoints`)).body).toEqual({
        endpoints: [],
      })
    })
  })

  describe('permissions', () => {
    it('lets only owners manage endpoints', async () => {
      const created = await create()
      const url = `${base}/${created.body.id}`
      expect((await bob.get(base)).status).toBe(403)
      expect(
        (await bob.post(base, { name: 'x', url: HOOK, events: ['list.item.added'] })).status,
      ).toBe(403)
      expect((await bob.patch(url, { enabled: false })).status).toBe(403)
      expect((await bob.delete(url)).status).toBe(403)
      expect((await bob.post(`${url}/test`)).status).toBe(403)
      expect((await bob.get(`${url}/deliveries`)).status).toBe(403)
    })
  })

  describe('validation', () => {
    it.each([
      [{ url: 'ftp://example.com/x' }, 422],
      [{ url: 'https://user:pw@example.com/x' }, 422],
      [{ url: 'nonsense' }, 422],
      [{ events: [] }, 400],
      [{ events: ['payment.received'] }, 400],
      [{ leadMinutes: 0 }, 400],
      [{ leadMinutes: 2000 }, 400],
      [{ extra: true }, 400],
    ])('refuses %j with %i', async (override, status) => {
      const res = await alice.post(base, {
        name: 'Chat',
        url: HOOK,
        events: ['list.item.added'],
        ...override,
      })
      expect(res.status).toBe(status)
    })

    it('refuses an empty change', async () => {
      const created = await create()
      expect((await alice.patch(`${base}/${created.body.id}`, {})).status).toBe(400)
    })
  })

  describe('signed deliveries', () => {
    it('sends a request whose signature a receiver can verify with the secret it was shown', async () => {
      const created = await create(['list.item.added'])
      const list = (
        await alice.post(`${V1}/households/${household}/lists`, {
          name: 'Groceries',
          kind: 'shopping',
        })
      ).body
      await bob.post(`${V1}/households/${household}/lists/${list.id}/items`, { text: 'Milk' })
      await env.services.notifications.tick()

      const [call] = env.webhooks.calls
      expect(call).toBeDefined()
      const headers = call!.headers!
      const timestamp = headers['x-orbit-timestamp']!
      const expected = createHmac('sha256', created.body.signingSecret)
        .update(`${timestamp}.${call!.body}`)
        .digest('hex')
      const received = headers['x-orbit-signature']!
      expect(received).toBe(`sha256=${expected}`)
      expect(timingSafeEqual(Buffer.from(received.slice(7)), Buffer.from(expected))).toBe(true)

      // Replay protection: the timestamp is current and is part of what is signed.
      expect(Math.abs(Number(timestamp) - env.clock.now().getTime() / 1000)).toBeLessThan(2)
      const replayed = createHmac('sha256', created.body.signingSecret)
        .update(`${Number(timestamp) + 600}.${call!.body}`)
        .digest('hex')
      expect(replayed).not.toBe(expected)

      expect(headers['x-orbit-event']).toBe('list.item.added')
      expect(JSON.parse(call!.body!)).toMatchObject({
        version: 1,
        id: headers['x-orbit-delivery'],
        event: 'list.item.added',
        data: { text: 'Milk', listName: 'Groceries' },
      })
    })

    it('records the outcome where the owner can read it, newest first', async () => {
      const created = await create()
      env.webhooks.reply(HOOK, 502, 200)
      await alice.post(`${base}/${created.body.id}/test`)
      await alice.post(`${base}/${created.body.id}/test`)
      const { deliveries } = (await alice.get(`${base}/${created.body.id}/deliveries`)).body
      expect(deliveries.map((d: { outcome: string }) => d.outcome)).toEqual(['delivered', 'failed'])
      expect(deliveries[1]).toMatchObject({
        event: 'notification.test',
        httpStatus: 502,
        error: 'The server answered 502.',
      })
    })

    it('switches off, back on and removes an endpoint', async () => {
      const created = await create()
      const url = `${base}/${created.body.id}`
      const off = await alice.patch(url, { enabled: false })
      expect(off.body).toMatchObject({ enabled: false, disabledReason: 'Switched off by an owner' })
      const on = await alice.patch(url, { enabled: true, leadMinutes: 45 })
      expect(on.body).toMatchObject({ enabled: true, leadMinutes: 45 })
      expect('disabledReason' in on.body).toBe(false)
      expect((await alice.delete(url)).status).toBe(204)
      expect((await alice.get(base)).body).toEqual({ endpoints: [] })
      expect((await alice.post(`${url}/test`)).status).toBe(404)
    })
  })
})
