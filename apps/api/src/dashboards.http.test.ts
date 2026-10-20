import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestEnv, type TestClient, type TestEnv } from './test-support.ts'

const V1 = '/api/v1'

describe.each(['memory', 'sqlite'] as const)(
  'households and dashboards over HTTP (%s)',
  (storage) => {
    let env: TestEnv
    let alice: TestClient
    let household: string

    beforeEach(async () => {
      env = await createTestEnv({ storage })
      alice = env.client()
      await alice.signUp('alice')
      household = (await alice.post(`${V1}/households`, { name: 'Home' })).body.id
    })
    afterEach(() => env.close())

    const newDashboard = async (body: object = { name: 'Week' }) =>
      (await alice.post(`${V1}/households/${household}/dashboards`, body)).body

    it('creates a household owned by the caller', async () => {
      const res = await alice.get(`${V1}/households/${household}`)
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ name: 'Home', members: [{ role: 'owner' }] })
    })

    it('builds, reorders, resizes and deletes a dashboard', async () => {
      const d = await newDashboard({ name: 'Week', columns: 2 })
      expect(d).toMatchObject({ name: 'Week', columns: 2, widgets: [] })

      await alice.post(`${V1}/dashboards/${d.id}/widgets`, { type: 'calendar.agenda', span: 2 })
      await alice.post(`${V1}/dashboards/${d.id}/widgets`, {
        type: 'lists.shopping',
        config: { listName: 'Køb ind', days: 7 },
      })
      const three = (
        await alice.post(`${V1}/dashboards/${d.id}/widgets`, { type: 'notes.quick', index: 0 })
      ).body
      expect(three.widgets.map((w: { type: string }) => w.type)).toEqual([
        'notes.quick',
        'calendar.agenda',
        'lists.shopping',
      ])

      const moved = await alice.put(
        `${V1}/dashboards/${d.id}/widgets/${three.widgets[0].id}/position`,
        { toIndex: 2 },
      )
      expect(moved.body.widgets.map((w: { type: string }) => w.type)).toEqual([
        'calendar.agenda',
        'lists.shopping',
        'notes.quick',
      ])
      expect(moved.body.widgets[1].config).toEqual({ listName: 'Køb ind', days: 7 })

      const widerId = moved.body.widgets[0].id
      const wider = await alice.put(`${V1}/dashboards/${d.id}/widgets/${widerId}/span`, { span: 2 })
      expect(wider.body.widgets[0].span).toBe(2)
      expect(
        (await alice.put(`${V1}/dashboards/${d.id}/widgets/${widerId}/span`, { span: 3 })).status,
      ).toBe(422)

      const configured = await alice.put(`${V1}/dashboards/${d.id}/widgets/${widerId}/config`, {
        config: { view: 'week' },
      })
      expect(configured.body.widgets[0].config).toEqual({ view: 'week' })
      expect(configured.body.widgets[1].config).toEqual({ listName: 'Køb ind', days: 7 })
      expect(
        (await alice.put(`${V1}/dashboards/${d.id}/widgets/${widerId}/config`, { config: 'x' }))
          .status,
      ).toBe(400)

      const narrow = await alice.put(`${V1}/dashboards/${d.id}/columns`, { columns: 1 })
      expect(narrow.body.widgets.every((w: { span: number }) => w.span === 1)).toBe(true)

      const renamed = await alice.put(`${V1}/dashboards/${d.id}/name`, { name: 'Kitchen' })
      expect(renamed.body.name).toBe('Kitchen')

      const removed = await alice.delete(
        `${V1}/dashboards/${d.id}/widgets/${moved.body.widgets[0].id}`,
      )
      expect(removed.body.widgets).toHaveLength(2)

      expect((await alice.get(`${V1}/dashboards/${d.id}`)).body).toEqual(removed.body)
      expect(
        (await alice.get(`${V1}/households/${household}/dashboards`)).body.dashboards,
      ).toHaveLength(1)

      expect((await alice.delete(`${V1}/dashboards/${d.id}`)).status).toBe(204)
      expect((await alice.get(`${V1}/dashboards/${d.id}`)).status).toBe(404)
    })

    it('adds a member by username and lets them read', async () => {
      const bob = env.client()
      await bob.signUp('bobby')
      const added = await alice.post(`${V1}/households/${household}/members`, { username: 'Bobby' })
      expect(added.status).toBe(200)
      expect(added.body.members).toHaveLength(2)
      const d = await newDashboard()
      expect((await bob.get(`${V1}/dashboards/${d.id}`)).status).toBe(200)
    })

    it('refuses to remove the last owner', async () => {
      const me = (await alice.get(`${V1}/auth/me`)).body.id
      const res = await alice.delete(`${V1}/households/${household}/members/${me}`)
      expect(res.status).toBe(422)
      expect(res.body.detail).toMatch(/at least one owner/)
    })

    it('answers an unknown username like any other missing resource', async () => {
      const res = await alice.post(`${V1}/households/${household}/members`, { username: 'ghost' })
      expect(res.status).toBe(404)
    })

    describe('validation', () => {
      it.each([
        ['unknown body field', { name: 'X', owner: 'me' }],
        ['empty name', { name: '' }],
        ['overlong name', { name: 'x'.repeat(81) }],
        ['columns out of range', { name: 'X', columns: 7 }],
        ['columns as string', { name: 'X', columns: '3' }],
      ])('rejects a dashboard with %s', async (_label, body) => {
        const res = await alice.post(`${V1}/households/${household}/dashboards`, body)
        expect(res.status).toBe(400)
        expect(res.body.type).toBe('urn:orbit:problem:validation')
      })

      it('maps domain rule violations to 422 and changes nothing', async () => {
        const d = await newDashboard()
        for (const body of [
          { type: 'not a widget type' },
          { type: 'Calendar.Agenda' },
          { type: 'calendar.agenda', span: 4 },
          { type: 'calendar.agenda', index: 5 },
        ]) {
          const res = await alice.post(`${V1}/dashboards/${d.id}/widgets`, body)
          expect(res.status, JSON.stringify(body)).toBe(422)
        }
        expect((await alice.get(`${V1}/dashboards/${d.id}`)).body.widgets).toEqual([])
      })

      it('bounds widget settings by depth, size and type', async () => {
        const d = await newDashboard()
        let deep: unknown = 1
        for (let i = 0; i < 20; i++) deep = { a: deep }
        const tooMany = Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`k${i}`, i]))
        for (const config of [deep, tooMany, 'a string', ['array'], 42]) {
          const res = await alice.post(`${V1}/dashboards/${d.id}/widgets`, {
            type: 'notes.quick',
            config,
          })
          expect(res.status).toBe(400)
        }
      })

      it('stores prototype-pollution-shaped settings as plain data', async () => {
        const d = await newDashboard()
        const res = await env.app.inject({
          method: 'POST',
          url: `${V1}/dashboards/${d.id}/widgets`,
          headers: { cookie: alice.cookie!, 'content-type': 'application/json' },
          payload:
            '{"type":"notes.quick","config":{"__proto__":{"admin":true},"constructor":{"x":1}}}',
        })
        expect(res.statusCode).toBeLessThan(500)
        expect(({} as Record<string, unknown>).admin).toBeUndefined()
      })

      it('rejects ids that are too long without echoing them', async () => {
        const res = await alice.get(`${V1}/dashboards/${'x'.repeat(200)}`)
        expect(res.status).toBe(414)
        expect(res.body.type).toBe('urn:orbit:problem:bad-request')
        expect(JSON.stringify(res.body)).not.toContain('xxxx')
      })

      it('rejects moving a widget out of range', async () => {
        const d = await newDashboard()
        const w = (await alice.post(`${V1}/dashboards/${d.id}/widgets`, { type: 'notes.quick' }))
          .body.widgets[0]
        expect(
          (await alice.put(`${V1}/dashboards/${d.id}/widgets/${w.id}/position`, { toIndex: 5 }))
            .status,
        ).toBe(422)
        expect(
          (await alice.put(`${V1}/dashboards/${d.id}/widgets/${w.id}/position`, { toIndex: -1 }))
            .status,
        ).toBe(400)
      })
    })

    it('returns only documented fields', async () => {
      const d = await newDashboard()
      expect(Object.keys(d).sort()).toEqual(['columns', 'householdId', 'id', 'name', 'widgets'])
      const me = (await alice.get(`${V1}/households/${household}`)).body
      expect(Object.keys(me).sort()).toEqual(['id', 'members', 'name'])
      expect(Object.keys(me.members[0]).sort()).toEqual(['role', 'userId'])
    })
  },
)
