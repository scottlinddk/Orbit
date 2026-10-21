import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { EgressDeniedError, type EgressRequest } from '@orbit/application'
import { createGuardedFetcher, type ResolvedAddress } from './guarded-fetcher.ts'

let server: http.Server
let port: number
let hostHeaders: Array<string | undefined> = []

beforeAll(async () => {
  server = http.createServer((req, res) => {
    hostHeaders.push(req.headers.host)
    const path = req.url ?? '/'
    if (path === '/ok') {
      res.setHeader('content-type', 'text/calendar')
      res.end('BEGIN:VCALENDAR')
    } else if (path === '/cookie') {
      res.setHeader('set-cookie', 'a=b')
      res.end(req.headers.cookie ?? 'no-cookie')
    } else if (path === '/to-ok') {
      res.statusCode = 302
      res.setHeader('location', '/ok')
      res.end()
    } else if (path === '/to-metadata') {
      res.statusCode = 302
      res.setHeader('location', 'http://169.254.169.254/latest/meta-data')
      res.end()
    } else if (path === '/to-other-host') {
      res.statusCode = 302
      res.setHeader('location', `http://other.test:${port}/ok`)
      res.end()
    } else if (path === '/to-file') {
      res.statusCode = 302
      res.setHeader('location', 'file:///etc/passwd')
      res.end()
    } else if (path === '/loop') {
      res.statusCode = 302
      res.setHeader('location', '/loop')
      res.end()
    } else if (path === '/big') {
      res.write('x'.repeat(2000))
      res.end('x'.repeat(2000))
    } else if (path === '/hang') {
      // never answers
    } else {
      res.statusCode = 404
      res.end('nope')
    }
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  port = (server.address() as AddressInfo).port
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise((done) => server.close(done))
})

const request = (url: string, extra: Partial<EgressRequest> = {}): EgressRequest => ({
  url,
  maxBytes: 1000,
  timeoutMs: 2000,
  ...extra,
})

const public4 = (address = '93.184.216.34'): ResolvedAddress => ({ address, family: 4 })
const loopback = public4('127.0.0.1')

/** Scripted DNS: every name maps to the given answers, and each lookup is counted. */
function scriptedDns(answers: Record<string, ResolvedAddress[]>) {
  const calls: string[] = []
  return {
    calls,
    resolve: async (hostname: string) => {
      calls.push(hostname)
      const found = answers[hostname]
      if (!found) throw new Error('NXDOMAIN')
      return found
    },
  }
}

const denied = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(EgressDeniedError)
  return error as EgressDeniedError
}

describe('createGuardedFetcher', () => {
  it('refuses loopback, metadata and private addresses by default', async () => {
    const fetcher = createGuardedFetcher()
    for (const host of [
      '127.0.0.1',
      '169.254.169.254',
      '10.0.0.5',
      '192.168.0.1',
      '[::1]',
      '[::ffff:7f00:1]',
      '2130706433', // 127.0.0.1 as one decimal number
      '0x7f.1', // 127.0.0.1 in hex shorthand
    ]) {
      const error = await denied(fetcher.fetchText(request(`http://${host}:${port}/ok`)))
      expect(error.reason).toBe('blocked-address')
    }
  })

  it('refuses a name that resolves to a private address', async () => {
    const dns = scriptedDns({ 'feed.test': [loopback] })
    const fetcher = createGuardedFetcher({ resolve: dns.resolve })
    const error = await denied(fetcher.fetchText(request(`http://feed.test:${port}/ok`)))
    expect(error.reason).toBe('blocked-address')
    expect(error.message).not.toContain('127.0.0.1')
  })

  it('refuses a mixed answer where only one record is private (rebinding)', async () => {
    const dns = scriptedDns({ 'feed.test': [public4(), loopback] })
    const fetcher = createGuardedFetcher({ resolve: dns.resolve })
    const error = await denied(fetcher.fetchText(request(`http://feed.test:${port}/ok`)))
    expect(error.reason).toBe('blocked-address')
  })

  it('allows a private host only when the administrator opted in for that host', async () => {
    const dns = scriptedDns({ 'nas.local': [loopback] })
    const fetcher = createGuardedFetcher({
      resolve: dns.resolve,
      allowPrivateHosts: new Set(['nas.local']),
    })
    const response = await fetcher.fetchText(request(`http://nas.local:${port}/ok`))
    expect(response).toMatchObject({
      status: 200,
      body: 'BEGIN:VCALENDAR',
      contentType: 'text/calendar',
    })
  })

  it('resolves once and connects to the address it checked, keeping the real Host header', async () => {
    hostHeaders = []
    const dns = scriptedDns({ 'nas.local': [loopback] })
    const fetcher = createGuardedFetcher({
      resolve: dns.resolve,
      allowPrivateHosts: new Set(['nas.local']),
    })
    await fetcher.fetchText(request(`http://nas.local:${port}/ok`))
    expect(dns.calls).toEqual(['nas.local'])
    expect(hostHeaders).toEqual([`nas.local:${port}`])
  })

  it('does not extend an opt-in to a different host reached by redirect', async () => {
    const dns = scriptedDns({ 'nas.local': [loopback], 'other.test': [loopback] })
    const fetcher = createGuardedFetcher({
      resolve: dns.resolve,
      allowPrivateHosts: new Set(['nas.local']),
    })
    const error = await denied(fetcher.fetchText(request(`http://nas.local:${port}/to-other-host`)))
    expect(error.reason).toBe('blocked-address')
  })

  it('checks the redirect target, even from an allowed host', async () => {
    const dns = scriptedDns({ 'nas.local': [loopback] })
    const fetcher = createGuardedFetcher({
      resolve: dns.resolve,
      allowPrivateHosts: new Set(['nas.local']),
    })
    const error = await denied(fetcher.fetchText(request(`http://nas.local:${port}/to-metadata`)))
    expect(error.reason).toBe('blocked-address')
  })

  it('follows a safe redirect', async () => {
    const dns = scriptedDns({ 'nas.local': [loopback] })
    const fetcher = createGuardedFetcher({
      resolve: dns.resolve,
      allowPrivateHosts: new Set(['nas.local']),
    })
    const response = await fetcher.fetchText(request(`http://nas.local:${port}/to-ok`))
    expect(response.body).toBe('BEGIN:VCALENDAR')
    expect(response.finalUrl).toBe(`http://nas.local:${port}/ok`)
  })

  it('refuses a redirect to a non-http scheme', async () => {
    const dns = scriptedDns({ 'nas.local': [loopback] })
    const fetcher = createGuardedFetcher({
      resolve: dns.resolve,
      allowPrivateHosts: new Set(['nas.local']),
    })
    const error = await denied(fetcher.fetchText(request(`http://nas.local:${port}/to-file`)))
    expect(error.reason).toBe('redirect')
  })

  it('stops a redirect loop', async () => {
    const dns = scriptedDns({ 'nas.local': [loopback] })
    const fetcher = createGuardedFetcher({
      resolve: dns.resolve,
      allowPrivateHosts: new Set(['nas.local']),
    })
    const error = await denied(fetcher.fetchText(request(`http://nas.local:${port}/loop`)))
    expect(error.reason).toBe('redirect')
  })

  it('rejects other schemes and credentials in the URL', async () => {
    const fetcher = createGuardedFetcher()
    expect((await denied(fetcher.fetchText(request('file:///etc/passwd')))).reason).toBe('scheme')
    expect((await denied(fetcher.fetchText(request('ftp://example.com/a')))).reason).toBe('scheme')
    expect((await denied(fetcher.fetchText(request('https://user:pw@example.com/a')))).reason).toBe(
      'credentials',
    )
    expect((await denied(fetcher.fetchText(request('not a url')))).reason).toBe('invalid-url')
  })

  it('reports a name that does not resolve without naming addresses', async () => {
    const fetcher = createGuardedFetcher({ resolve: scriptedDns({}).resolve })
    expect((await denied(fetcher.fetchText(request('http://missing.test/a')))).reason).toBe('dns')
  })

  it('cuts off a response past the size cap', async () => {
    const dns = scriptedDns({ 'nas.local': [loopback] })
    const fetcher = createGuardedFetcher({
      resolve: dns.resolve,
      allowPrivateHosts: new Set(['nas.local']),
    })
    const error = await denied(fetcher.fetchText(request(`http://nas.local:${port}/big`)))
    expect(error.reason).toBe('too-large')
  })

  it('gives up on a server that never answers', async () => {
    const dns = scriptedDns({ 'nas.local': [loopback] })
    const fetcher = createGuardedFetcher({
      resolve: dns.resolve,
      allowPrivateHosts: new Set(['nas.local']),
    })
    const error = await denied(
      fetcher.fetchText(request(`http://nas.local:${port}/hang`, { timeoutMs: 150 })),
    )
    expect(error.reason).toBe('timeout')
  })

  it('never sends a cookie, and returns error statuses to the caller', async () => {
    const dns = scriptedDns({ 'nas.local': [loopback] })
    const fetcher = createGuardedFetcher({
      resolve: dns.resolve,
      allowPrivateHosts: new Set(['nas.local']),
    })
    const first = await fetcher.fetchText(request(`http://nas.local:${port}/cookie`))
    const second = await fetcher.fetchText(request(`http://nas.local:${port}/cookie`))
    expect(second.body).toBe('no-cookie')
    expect(first.body).toBe('no-cookie')
    const missing = await fetcher.fetchText(request(`http://nas.local:${port}/missing`))
    expect(missing).toMatchObject({ status: 404, body: 'nope' })
  })
})
