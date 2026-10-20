import { Writable } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_SESSION_TTL_MS } from '@orbit/application'
import { loggerOptions } from './logging.ts'
import { PASSWORD, createTestEnv, type TestEnv } from './test-support.ts'

const REGISTER = '/api/v1/auth/register'
const LOGIN = '/api/v1/auth/login'
const ME = '/api/v1/auth/me'

describe.each(['memory', 'sqlite'] as const)('auth over HTTP (%s)', (storage) => {
  let env: TestEnv
  const start = async (options: Parameters<typeof createTestEnv>[0] = {}) =>
    (env = await createTestEnv({ storage, ...options }))
  afterEach(() => env?.close())

  describe('registration', () => {
    it('creates an account and returns only the id and display name', async () => {
      await start()
      const res = await env.client().post(REGISTER, { username: 'Alice', password: PASSWORD })
      expect(res.status).toBe(201)
      expect(Object.keys(res.body).sort()).toEqual(['displayName', 'id'])
      expect(res.body.displayName).toBe('alice')
      expect(JSON.stringify(res.body)).not.toContain(PASSWORD)
      expect(res.headers['set-cookie']).toBeUndefined()
    })

    it('closes after the first account by default, with a problem response', async () => {
      await start({ env: { ORBIT_REGISTRATION: 'first-user-only' } })
      const c = env.client()
      expect((await c.post(REGISTER, { username: 'alice', password: PASSWORD })).status).toBe(201)
      const second = await c.post(REGISTER, { username: 'bobby', password: PASSWORD })
      expect(second.status).toBe(403)
      expect(second.headers['content-type']).toContain('application/problem+json')
      expect(second.body).toMatchObject({
        type: 'urn:orbit:problem:registration-closed',
        status: 403,
      })
    })

    it('reports a duplicate username, ignoring case', async () => {
      await start()
      const c = env.client()
      await c.post(REGISTER, { username: 'alice', password: PASSWORD })
      const dup = await c.post(REGISTER, { username: 'ALICE', password: PASSWORD })
      expect(dup.status).toBe(409)
    })

    it.each([
      ['a short password', { username: 'alice', password: 'short' }, 400],
      ['an invalid username', { username: 'a b', password: PASSWORD }, 422],
      ['an unknown field', { username: 'alice', password: PASSWORD, role: 'admin' }, 400],
      ['a missing password', { username: 'alice' }, 400],
      ['a non-string password', { username: 'alice', password: 123456789012 }, 400],
    ])('rejects %s', async (_label, body, status) => {
      await start()
      const res = await env.client().post(REGISTER, body)
      expect(res.status).toBe(status)
      expect(res.body.type).toMatch(/^urn:orbit:problem:/)
      expect(JSON.stringify(res.body)).not.toContain(PASSWORD)
    })

    it('lists failing fields without echoing submitted values', async () => {
      await start()
      const res = await env.client().post(REGISTER, { username: 'alice', password: 'tiny' })
      expect(res.body.errors).toEqual([expect.objectContaining({ path: 'password' })])
      expect(JSON.stringify(res.body)).not.toContain('tiny')
    })
  })

  describe('login and sessions', () => {
    it('sets an HttpOnly, SameSite=Strict cookie and never puts the token in the body', async () => {
      await start()
      const c = env.client()
      await c.post(REGISTER, { username: 'alice', password: PASSWORD })
      const res = await c.post(LOGIN, { username: 'alice', password: PASSWORD })
      expect(res.status).toBe(200)
      const cookie = res.raw.cookies.find((x) => x.name === 'orbit_session')!
      expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/' })
      expect(cookie.secure).toBeFalsy()
      expect(cookie.domain).toBeUndefined()
      expect(cookie.expires!.getTime()).toBe(env.clock.now().getTime() + DEFAULT_SESSION_TTL_MS)
      expect(JSON.stringify(res.body)).not.toContain(cookie.value)
    })

    it('uses a Secure __Host- cookie when the public URL is https', async () => {
      await start({ env: { ORBIT_PUBLIC_URL: 'https://orbit.example.com' } })
      const c = env.client()
      await c.post(REGISTER, { username: 'alice', password: PASSWORD })
      const res = await c.post(
        LOGIN,
        { username: 'alice', password: PASSWORD },
        {
          origin: 'https://orbit.example.com',
        },
      )
      const cookie = res.raw.cookies.find((x) => x.name === '__Host-orbit_session')!
      expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict', path: '/' })
      expect(cookie.domain).toBeUndefined()
    })

    it('answers identically for a wrong password, an unknown user and a malformed name', async () => {
      await start()
      const c = env.client()
      await c.post(REGISTER, { username: 'alice', password: PASSWORD })
      const replies = await Promise.all([
        c.post(LOGIN, { username: 'alice', password: 'wrong password!!' }),
        c.post(LOGIN, { username: 'nobody', password: PASSWORD }),
        c.post(LOGIN, { username: '!!', password: PASSWORD }),
      ])
      for (const r of replies) {
        expect(r.status).toBe(401)
        expect(r.raw.cookies).toHaveLength(0)
        expect(r.body).toEqual(replies[0]!.body)
      }
    })

    it('protects /me and accepts only a real session', async () => {
      await start()
      const c = env.client()
      expect((await c.get(ME)).status).toBe(401)
      await c.signUp('alice')
      const me = await c.get(ME)
      expect(me.status).toBe(200)
      expect(me.body.displayName).toBe('alice')

      const forged = env.client()
      forged.cookie = 'orbit_session=forged-token-value'
      expect((await forged.get(ME)).status).toBe(401)
    })

    it('ends the session on logout, so the old cookie stops working', async () => {
      await start()
      const c = env.client()
      await c.signUp('alice')
      const stolen = c.cookie
      const out = await c.post('/api/v1/auth/logout')
      expect(out.status).toBe(204)
      expect(c.cookie).toBeUndefined()
      const replay = env.client()
      replay.cookie = stolen
      expect((await replay.get(ME)).status).toBe(401)
    })

    it('expires sessions after the lifetime', async () => {
      await start()
      const c = env.client()
      await c.signUp('alice')
      env.clock.advance(DEFAULT_SESSION_TTL_MS - 1000)
      expect((await c.get(ME)).status).toBe(200)
      env.clock.advance(1000)
      expect((await c.get(ME)).status).toBe(401)
    })

    it('gives a new session token on every login', async () => {
      await start()
      const a = env.client()
      await a.signUp('alice')
      const b = env.client()
      await b.post(LOGIN, { username: 'alice', password: PASSWORD })
      expect(b.cookie).toBeDefined()
      expect(b.cookie).not.toBe(a.cookie)
    })
  })

  describe('request hardening', () => {
    it('rejects a state-changing request from another origin, even with a valid session', async () => {
      await start()
      const c = env.client()
      await c.signUp('alice')
      const evil = await c.post(
        '/api/v1/households',
        { name: 'Hijack' },
        { origin: 'https://evil.example' },
      )
      expect(evil.status).toBe(403)
      expect(evil.body.type).toBe('urn:orbit:problem:origin-not-allowed')
      expect((await c.get('/api/v1/households')).body.households).toEqual([])
    })

    it('rejects the literal "null" origin sent by sandboxed pages', async () => {
      await start()
      const c = env.client()
      await c.signUp('alice')
      expect((await c.post('/api/v1/households', { name: 'X' }, { origin: 'null' })).status).toBe(
        403,
      )
    })

    it('allows the configured origin and requests without an Origin header', async () => {
      await start()
      const c = env.client()
      await c.signUp('alice')
      const same = await c.post(
        '/api/v1/households',
        { name: 'One' },
        { origin: 'http://localhost:3000' },
      )
      expect(same.status).toBe(201)
      expect((await c.post('/api/v1/households', { name: 'Two' })).status).toBe(201)
    })

    it('does not apply the origin check to reads', async () => {
      await start()
      const c = env.client()
      await c.signUp('alice')
      expect((await c.get('/api/v1/households', { origin: 'https://evil.example' })).status).toBe(
        200,
      )
    })

    it.each([
      ['text/plain', '{"name":"Form"}'],
      ['application/x-www-form-urlencoded', 'name=Form'],
      ['multipart/form-data; boundary=x', '--x--'],
    ])('refuses %s bodies, which a cross-site form could send', async (contentType, payload) => {
      await start()
      const c = env.client()
      await c.signUp('alice')
      const res = await env.app.inject({
        method: 'POST',
        url: '/api/v1/households',
        headers: { cookie: c.cookie!, 'content-type': contentType },
        payload,
      })
      expect(res.statusCode).toBe(415)
      expect((await c.get('/api/v1/households')).body.households).toEqual([])
    })

    it('rejects oversized bodies', async () => {
      await start()
      const c = env.client()
      await c.signUp('alice')
      const res = await c.post('/api/v1/households', { name: 'x'.repeat(100_000) })
      expect(res.status).toBe(413)
    })

    it('reports malformed JSON as a problem, not a stack trace', async () => {
      await start()
      const res = await env.app.inject({
        method: 'POST',
        url: LOGIN,
        headers: { 'content-type': 'application/json' },
        payload: '{"username": ',
      })
      expect(res.statusCode).toBe(400)
      expect(JSON.parse(res.body).type).toMatch(/^urn:orbit:problem:/)
      expect(res.body).not.toMatch(/at .*\.(ts|js):\d+/)
    })

    it('sends security headers and forbids caching on every response', async () => {
      await start()
      const res = await env.client().get(ME)
      expect(res.headers['cache-control']).toBe('no-store')
      expect(res.headers['x-content-type-options']).toBe('nosniff')
      expect(res.headers['content-security-policy']).toContain("default-src 'none'")
      expect(res.headers['x-request-id']).toBeDefined()
    })

    it('answers unknown routes with a problem response', async () => {
      await start()
      const res = await env.client().get('/api/v1/nope')
      expect(res.status).toBe(404)
      expect(res.body).toMatchObject({ type: 'urn:orbit:problem:not-found', status: 404 })
    })

    it('rate limits login attempts per client', async () => {
      await start({ app: { authRateLimit: { max: 3, timeWindow: '1 minute' } } })
      const c = env.client()
      const statuses: number[] = []
      for (let i = 0; i < 5; i++) {
        statuses.push(
          (await c.post(LOGIN, { username: 'alice', password: 'wrong password!!' })).status,
        )
      }
      expect(statuses).toEqual([401, 401, 401, 429, 429])
    })
  })

  describe('logging', () => {
    it('never writes passwords or session tokens to the logs', async () => {
      const lines: string[] = []
      const stream = new Writable({
        write(chunk, _enc, done) {
          lines.push(String(chunk))
          done()
        },
      })
      await start({ app: { logger: { ...loggerOptions('trace'), stream } } })
      const c = env.client()
      await c.post(REGISTER, { username: 'alice', password: PASSWORD })
      await c.post(LOGIN, { username: 'alice', password: PASSWORD })
      await c.get(ME)
      await c.post(LOGIN, { username: 'alice', password: 'wrong password!!' })
      const token = c.cookie!.split('=')[1]!
      const logs = lines.join('')
      expect(logs.length).toBeGreaterThan(0)
      expect(logs).not.toContain(PASSWORD)
      expect(logs).not.toContain('wrong password')
      expect(logs).not.toContain(token)
    })
  })
})
