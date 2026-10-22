import { createHmac } from 'node:crypto'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { createGuardedFetcher } from '@orbit/adapter-egress-guard'
import { InMemorySecretStore } from '@orbit/adapter-in-memory'
import { createNotificationService, type Actor, type NotificationService } from '@orbit/application'
import type { HouseholdId } from '@orbit/domain'
import { createInMemoryRepositories, createSystem, type TestSystem } from '@orbit/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createNodeNotificationPlatform } from './notification-platform.ts'

/**
 * Notification webhooks through the real egress guard and a real local HTTP server. The server
 * stands for a receiver that a household owner (or an attacker with an owner's session) points
 * Orbit at.
 */
interface Received {
  method: string | undefined
  path: string | undefined
  headers: http.IncomingHttpHeaders
  body: string
}

let server: http.Server
let port: number
let received: Received[] = []
let statusQueue: number[] = []

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      received.push({
        method: req.method,
        path: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      })
      if (req.url === '/redirect') {
        res.statusCode = 302
        res.setHeader('location', 'http://169.254.169.254/latest/meta-data')
        res.end()
      } else if (req.url === '/huge') {
        res.end('x'.repeat(300 * 1024))
      } else {
        res.statusCode = statusQueue.length > 1 ? statusQueue.shift()! : (statusQueue[0] ?? 200)
        res.end('ok')
      }
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as AddressInfo).port
})
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

describe('notification webhooks through the egress guard', () => {
  let sys: TestSystem
  let alice: Actor
  let household: HouseholdId

  beforeEach(async () => {
    received = []
    statusQueue = []
    sys = createSystem(createInMemoryRepositories())
    alice = await sys.newActor('alice')
    household = (await sys.useCases.createHousehold(alice, { name: 'Home' })).id
  })

  /** A notification service over the same data, with the real guard and the real platform. */
  const serviceWith = (
    allowPrivateHosts: string[] = [],
    resolve?: (host: string) => Promise<{ address: string; family: 4 | 6 }[]>,
  ): NotificationService =>
    createNotificationService({
      endpoints: sys.repos.notificationEndpoints,
      log: sys.repos.deliveryLog,
      dedupe: sys.repos.notificationDedupe,
      households: sys.repos.households,
      secrets: new InMemorySecretStore(),
      fetcher: createGuardedFetcher({
        allowPrivateHosts: new Set(allowPrivateHosts),
        ...(resolve === undefined ? {} : { resolve }),
      }),
      jobs: sys.jobs,
      platform: createNodeNotificationPlatform(),
      calendar: sys.calendar,
      clock: sys.clock,
      ids: { next: () => crypto.randomUUID() },
    })

  const register = (svc: NotificationService, url: string) =>
    svc.addEndpoint(alice, household, {
      name: 'Hook',
      url,
      events: ['list.item.added'],
    })

  describe('refuses to reach the household network', () => {
    it.each([
      ['loopback', () => `http://127.0.0.1:${port}/hook`],
      ['localhost', () => `http://localhost:${port}/hook`],
      ['cloud metadata', () => 'http://169.254.169.254/latest/meta-data'],
      ['a LAN address', () => 'http://192.168.1.10/hook'],
      ['a private 10.x address', () => 'http://10.0.0.5:8080/hook'],
      ['IPv6 loopback', () => `http://[::1]:${port}/hook`],
    ])('%s', async (_label, url) => {
      const svc = serviceWith()
      const { endpoint } = await register(svc, url())
      const entry = await svc.sendTest(alice, household, endpoint.id)
      expect(entry).toMatchObject({ outcome: 'failed', error: 'That address is not allowed.' })
      expect(received).toEqual([]) // nothing reached the local server
      // The message names neither the address nor where it points.
      expect(JSON.stringify(entry)).not.toMatch(/127\.0\.0\.1|169\.254|192\.168|10\.0\.0|::1/)
    })

    it('refuses a name that resolves to a private address, even when another answer is public', async () => {
      const svc = serviceWith([], async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.1', family: 4 },
      ])
      const { endpoint } = await register(svc, 'https://rebind.example.com/hook')
      expect(await svc.sendTest(alice, household, endpoint.id)).toMatchObject({
        outcome: 'failed',
        error: 'That address is not allowed.',
      })
    })

    it('does not retry a refused address when it comes from a queued event', async () => {
      const svc = serviceWith()
      await register(svc, `http://127.0.0.1:${port}/hook`)
      await svc.publishNow(household, 'list.item.added', { text: 'Milk' })
      await svc.tick()
      sys.clock.advance(2 * 60 * 60 * 1000)
      await svc.tick()
      expect(received).toEqual([])
      expect([...sys.jobs.jobs.keys()]).toEqual([])
    })
  })

  describe('with the administrator’s opt-in for one host', () => {
    it('delivers a signed request that the receiver can verify', async () => {
      const svc = serviceWith(['127.0.0.1'])
      const { endpoint, signingSecret } = await register(svc, `http://127.0.0.1:${port}/hook?x=1`)
      const entry = await svc.sendTest(alice, household, endpoint.id)
      expect(entry).toMatchObject({ outcome: 'delivered', httpStatus: 200 })

      expect(received).toHaveLength(1)
      const [req] = received
      expect(req).toMatchObject({ method: 'POST', path: '/hook?x=1' })
      expect(req!.headers['content-type']).toBe('application/json')
      expect(req!.headers['x-orbit-event']).toBe('notification.test')
      expect(req!.headers.cookie).toBeUndefined()
      const timestamp = String(req!.headers['x-orbit-timestamp'])
      const expected = createHmac('sha256', signingSecret)
        .update(`${timestamp}.${req!.body}`)
        .digest('hex')
      expect(req!.headers['x-orbit-signature']).toBe(`sha256=${expected}`)
      expect(JSON.parse(req!.body)).toMatchObject({ version: 1, event: 'notification.test' })
    })

    it('does not follow a redirect, because it would resend the payload somewhere nobody chose', async () => {
      const svc = serviceWith(['127.0.0.1'])
      const { endpoint } = await register(svc, `http://127.0.0.1:${port}/redirect`)
      const entry = await svc.sendTest(alice, household, endpoint.id)
      expect(entry).toMatchObject({
        outcome: 'failed',
        error: 'The server answered with a redirect.',
      })
      expect(received).toHaveLength(1)
    })

    it('treats an enormous reply as a failure, not as memory to fill', async () => {
      const svc = serviceWith(['127.0.0.1'])
      const { endpoint } = await register(svc, `http://127.0.0.1:${port}/huge`)
      expect(await svc.sendTest(alice, household, endpoint.id)).toMatchObject({
        outcome: 'failed',
        error: 'The response is too large.',
      })
    })

    it('retries a real 503 and then delivers, without repeating the delivery id', async () => {
      statusQueue = [503, 200]
      const svc = serviceWith(['127.0.0.1'])
      const { endpoint } = await register(svc, `http://127.0.0.1:${port}/hook`)
      await svc.publishNow(household, 'list.item.added', { text: 'Milk' })
      await svc.tick()
      sys.clock.advance(31 * 1000)
      await svc.tick()
      expect(received.map((r) => r.headers['x-orbit-delivery'])).toHaveLength(2)
      expect(new Set(received.map((r) => r.headers['x-orbit-delivery'])).size).toBe(1)
      const entries = (await svc.deliveries(alice, household, endpoint.id)).reverse()
      expect(entries.map((e) => e.outcome)).toEqual(['retrying', 'delivered'])
    })

    it('does not extend the opt-in to another host', async () => {
      const svc = serviceWith(['127.0.0.1'])
      const { endpoint } = await register(svc, `http://localhost:${port}/hook`)
      expect(await svc.sendTest(alice, household, endpoint.id)).toMatchObject({
        outcome: 'failed',
        error: 'That address is not allowed.',
      })
      expect(received).toEqual([])
    })
  })
})
