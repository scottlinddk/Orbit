import { OneTimeSetupGate } from '@orbit/adapter-identity-local'
import { FakeOidcProvider, type TokenOverrides } from '@orbit/adapter-oidc/testing'
import { createOidcProvider } from '@orbit/adapter-oidc'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadConfig } from './config.ts'
import { PASSWORD, createTestEnv, type TestClient, type TestEnv } from './test-support.ts'

const V1 = '/api/v1'
const ISSUER = 'https://id.example.com/realms/home'
const OIDC_ENV = {
  ORBIT_PUBLIC_URL: 'https://orbit.example.com',
  ORBIT_OIDC_ISSUER: ISSUER,
  ORBIT_OIDC_CLIENT_ID: 'orbit',
  ORBIT_OIDC_CLIENT_SECRET: 'client-secret-value',
  ORBIT_OIDC_BUTTON_LABEL: 'Home login',
}
const SESSION = '__Host-orbit_session'
const FLOW = '__Host-orbit_oidc'

describe.each(['memory', 'sqlite'] as const)('OIDC sign-in over HTTP (%s)', (storage) => {
  let env: TestEnv
  let fake: FakeOidcProvider
  let browserClock: number

  async function setup(
    extra: Record<string, string> = {},
    options: {
      setupGate?: OneTimeSetupGate
      authRateLimit?: { max: number; timeWindow: string }
    } = {},
  ) {
    fake = await FakeOidcProvider.create({
      issuer: ISSUER,
      clientId: 'orbit',
      clientSecret: OIDC_ENV.ORBIT_OIDC_CLIENT_SECRET,
    })
    const env0 = { ...OIDC_ENV, ...extra }
    const config = loadConfig({ ORBIT_REGISTRATION: 'open', ...env0 })
    const oidc = createOidcProvider(config.oidc!, fake, { now: () => fake.now })
    browserClock = Date.now()
    env = await createTestEnv({
      storage,
      env: env0,
      oidc,
      ...(options.setupGate ? { setupGate: options.setupGate } : {}),
      app: {
        oidcNow: () => browserClock,
        ...(options.authRateLimit ? { authRateLimit: options.authRateLimit } : {}),
      },
    })
  }
  afterEach(() => env.close())

  /** The cookie the browser holds after the start request. */
  const flowCookie = (reply: { raw: { cookies: Array<{ name: string; value: string }> } }) => {
    const found = reply.raw.cookies.find((c) => c.name === FLOW)
    return found ? `${FLOW}=${found.value}` : undefined
  }

  /** A browser signing in: start, approve at the provider, come back to the callback. */
  async function signIn(
    claims: Record<string, unknown>,
    options: {
      client?: TestClient
      body?: Record<string, unknown>
      overrides?: TokenOverrides
      state?: (real: string) => string
      cookie?: (real: string) => string
      query?: (q: { code: string; state: string }) => string
    } = {},
  ) {
    const client = options.client ?? env.client()
    const started = await client.post(`${V1}/auth/oidc/start`, options.body ?? {})
    if (started.status !== 200) return { started, client }
    const approval = fake.approve(started.body.authorizationUrl, claims, options.overrides)
    const cookie = flowCookie(started)!
    const query =
      options.query?.(approval) ??
      `code=${approval.code}&state=${options.state?.(approval.state) ?? approval.state}`
    const callback = await env.app.inject({
      method: 'GET',
      url: `${V1}/auth/oidc/callback?${query}`,
      headers: { cookie: options.cookie ? options.cookie(cookie) : cookie },
    })
    const session = callback.cookies.find((c) => c.name === SESSION)
    return { started, callback, session, client, approval, cookie }
  }

  const location = (callback: { body: string }) =>
    /content="0; url=([^"]+)"/.exec(callback.body)?.[1]?.replaceAll('&amp;', '&')

  const asSession = async (session: { value: string } | undefined) => {
    const client = env.client()
    client.cookie = `${SESSION}=${session!.value}`
    return client
  }

  describe('with open registration', () => {
    beforeEach(() => setup())

    it('tells the login page what is on offer', async () => {
      const res = await env.client().get(`${V1}/auth/providers`)
      expect(res.body).toEqual({ local: true, oidc: { label: 'Home login' } })
    })

    it('signs a new person in, and the session works like a password session', async () => {
      const result = await signIn({ sub: 'user-1', name: 'Una Example' })
      expect(result.callback!.statusCode).toBe(200)
      expect(location(result.callback!)).toBe('/')
      expect(result.callback!.headers.refresh).toBe('0; url=/')
      expect(result.session).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict' })
      const me = await (await asSession(result.session)).get(`${V1}/auth/me`)
      expect(me.status).toBe(200)
      expect(me.body.displayName).toBe('Una Example')
    })

    it('puts nothing secret in the authorization URL or the response body', async () => {
      const started = await env.client().post(`${V1}/auth/oidc/start`, {})
      const url = new URL(started.body.authorizationUrl)
      expect(url.origin + url.pathname).toBe(`${ISSUER}/authorize`)
      expect(url.searchParams.get('client_secret')).toBeNull()
      expect(url.searchParams.get('code_verifier')).toBeNull()
      expect(url.searchParams.get('code_challenge_method')).toBe('S256')
      expect(JSON.stringify(started.body)).not.toContain(OIDC_ENV.ORBIT_OIDC_CLIENT_SECRET)
    })

    it('keeps the flow state in a short-lived HttpOnly Lax cookie and clears it afterwards', async () => {
      const result = await signIn({ sub: 'user-1' })
      const set = result.started.raw.cookies.find((c) => c.name === FLOW)!
      expect(set).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 600 })
      const cleared = result.callback!.cookies.find((c) => c.name === FLOW)!
      expect(cleared.value).toBe('')
    })

    it('signs the same person into the same account next time', async () => {
      const first = await signIn({ sub: 'user-1', name: 'Una' })
      const second = await signIn({ sub: 'user-1', name: 'Una Renamed' })
      const a = await (await asSession(first.session)).get(`${V1}/auth/me`)
      const b = await (await asSession(second.session)).get(`${V1}/auth/me`)
      expect(b.body.id).toBe(a.body.id)
      expect(b.body.displayName).toBe('Una')
    })

    it('gives two different subjects two different accounts', async () => {
      const a = await signIn({ sub: 'user-1' })
      const b = await signIn({ sub: 'user-2' })
      const idOf = async (r: typeof a) =>
        (await (await asSession(r.session)).get(`${V1}/auth/me`)).body.id
      expect(await idOf(a)).not.toBe(await idOf(b))
    })

    it('never matches an existing account by username or email', async () => {
      const alice = env.client()
      const local = await alice.signUp('alice')
      const result = await signIn({
        sub: 'attacker',
        preferred_username: 'alice',
        email: 'alice@example.com',
        email_verified: true,
        name: 'alice',
      })
      const me = await (await asSession(result.session)).get(`${V1}/auth/me`)
      expect(me.status).toBe(200)
      expect(me.body.id).not.toBe(local.id)
    })

    it('rejects a callback whose state does not match', async () => {
      const result = await signIn({ sub: 'user-1' }, { state: () => 'forged-state' })
      expect(location(result.callback!)).toBe('/login?oidc=failed')
      expect(result.session).toBeUndefined()
    })

    it('rejects a callback without the flow cookie', async () => {
      const result = await signIn({ sub: 'user-1' }, { cookie: () => '' })
      expect(location(result.callback!)).toBe('/login?oidc=expired')
      expect(result.session).toBeUndefined()
    })

    it('rejects a tampered flow cookie', async () => {
      const result = await signIn(
        { sub: 'user-1' },
        { cookie: (c) => c.replace(/\.[^.]*$/, '.AAAA') },
      )
      expect(location(result.callback!)).toBe('/login?oidc=expired')
      expect(result.session).toBeUndefined()
    })

    it('rejects a flow cookie forged for someone else’s state', async () => {
      const mine = await signIn({ sub: 'user-1' })
      const other = await env.client().post(`${V1}/auth/oidc/start`, {})
      // Another browser's cookie does not match this callback's state.
      const callback = await env.app.inject({
        method: 'GET',
        url: `${V1}/auth/oidc/callback?code=${mine.approval!.code}&state=${mine.approval!.state}`,
        headers: { cookie: flowCookie(other)! },
      })
      expect(location(callback)).toBe('/login?oidc=failed')
    })

    it('rejects a flow that took longer than ten minutes', async () => {
      const started = await env.client().post(`${V1}/auth/oidc/start`, {})
      const approval = fake.approve(started.body.authorizationUrl, { sub: 'u' })
      browserClock += 11 * 60 * 1000
      const callback = await env.app.inject({
        method: 'GET',
        url: `${V1}/auth/oidc/callback?code=${approval.code}&state=${approval.state}`,
        headers: { cookie: flowCookie(started)! },
      })
      expect(location(callback)).toBe('/login?oidc=expired')
    })

    it.each([
      ['a wrong nonce', { nonce: 'other' }],
      ['an expired token', { expiresIn: -3600 }],
      ['another audience', { audience: 'not-orbit' }],
      ['another issuer', { issuer: 'https://evil.example.com' }],
      ['a forged signature', { foreignKey: true }],
    ] as const)('refuses an ID token with %s', async (_name, overrides) => {
      const result = await signIn({ sub: 'user-1' }, { overrides })
      expect(location(result.callback!)).toBe('/login?oidc=failed')
      expect(result.session).toBeUndefined()
    })

    it('treats the provider’s error response as a refusal', async () => {
      const result = await signIn({ sub: 'u' }, { query: () => 'error=access_denied&state=x' })
      expect(location(result.callback!)).toBe('/login?oidc=denied')
      expect(result.session).toBeUndefined()
    })

    it('cannot replay a callback', async () => {
      const first = await signIn({ sub: 'user-1' })
      const replay = await env.app.inject({
        method: 'GET',
        url: `${V1}/auth/oidc/callback?code=${first.approval!.code}&state=${first.approval!.state}`,
        headers: { cookie: first.cookie! },
      })
      expect(location(replay)).toBe('/login?oidc=failed')
      expect(replay.cookies.find((c) => c.name === SESSION)).toBeUndefined()
    })

    it('answers an unreachable provider with a problem, not a stack trace', async () => {
      fake.down = true
      const res = await env.client().post(`${V1}/auth/oidc/start`, {})
      expect(res.status).toBe(502)
      expect(res.body.type).toBe('urn:orbit:problem:identity-provider-unavailable')
    })

    it('does not create a session for a callback that has no state at all', async () => {
      const started = await env.client().post(`${V1}/auth/oidc/start`, {})
      const callback = await env.app.inject({
        method: 'GET',
        url: `${V1}/auth/oidc/callback`,
        headers: { cookie: flowCookie(started)! },
      })
      expect(location(callback)).toBe('/login?oidc=failed')
    })

    describe('linking', () => {
      it('links a signed-in user, and then that provider account signs in as them', async () => {
        const alice = env.client()
        const local = await alice.signUp('alice')
        const linked = await signIn(
          { sub: 'alice-at-idp' },
          { client: alice, body: { link: true } },
        )
        expect(location(linked.callback!)).toBe('/?oidc=linked')
        // Linking does not hand out a new session.
        expect(linked.session).toBeUndefined()

        const later = await signIn({ sub: 'alice-at-idp' })
        const me = await (await asSession(later.session)).get(`${V1}/auth/me`)
        expect(me.body.id).toBe(local.id)
      })

      it('needs a session to start a link', async () => {
        const res = await env.client().post(`${V1}/auth/oidc/start`, { link: true })
        expect(res.status).toBe(401)
      })

      it('refuses to take over an identity that belongs to someone else', async () => {
        await signIn({ sub: 'taken' })
        const bob = env.client()
        await bob.signUp('bobby')
        const result = await signIn({ sub: 'taken' }, { client: bob, body: { link: true } })
        expect(location(result.callback!)).toBe('/login?oidc=taken')
      })

      it('does not let a link started by one user finish as another', async () => {
        const alice = env.client()
        const aliceUser = await alice.signUp('alice')
        const started = await alice.post(`${V1}/auth/oidc/start`, { link: true })
        const approval = fake.approve(started.body.authorizationUrl, { sub: 'alice-at-idp' })
        // The intent is in the signed cookie, not in anything the callback URL can change.
        const callback = await env.app.inject({
          method: 'GET',
          url: `${V1}/auth/oidc/callback?code=${approval.code}&state=${approval.state}&link=bob`,
          headers: { cookie: flowCookie(started)! },
        })
        expect(location(callback)).toBe('/?oidc=linked')
        const later = await signIn({ sub: 'alice-at-idp' })
        const me = await (await asSession(later.session)).get(`${V1}/auth/me`)
        expect(me.body.id).toBe(aliceUser.id)
      })
    })

    it('rejects unknown fields in the start request', async () => {
      const res = await env.client().post(`${V1}/auth/oidc/start`, { extra: 1 })
      expect(res.status).toBe(400)
    })
  })

  describe('with a closed instance', () => {
    beforeEach(() => setup({ ORBIT_REGISTRATION: 'first-user-only' }))

    it('does not create accounts for strangers', async () => {
      const result = await signIn({ sub: 'stranger' })
      expect(location(result.callback!)).toBe('/login?oidc=closed')
      expect(result.session).toBeUndefined()
    })

    it('lets a known identity back in', async () => {
      // Link first (a password user links), then sign in with it while registration is closed.
      const alice = env.client()
      await alice.post(`${V1}/auth/register`, { username: 'alice', password: PASSWORD })
      await alice.post(`${V1}/auth/login`, { username: 'alice', password: PASSWORD })
      await signIn({ sub: 'alice-at-idp' }, { client: alice, body: { link: true } })
      const result = await signIn({ sub: 'alice-at-idp' })
      expect(result.session).toBeDefined()
    })

    it('admits an invited person, once', async () => {
      const alice = env.client()
      await alice.post(`${V1}/auth/register`, { username: 'alice', password: PASSWORD })
      await alice.post(`${V1}/auth/login`, { username: 'alice', password: PASSWORD })
      const household = (await alice.post(`${V1}/households`, { name: 'Home' })).body.id
      const { token } = (await alice.post(`${V1}/households/${household}/invitations`, {})).body

      const joined = await signIn({ sub: 'guest', name: 'Gus' }, { body: { inviteToken: token } })
      expect(location(joined.callback!)).toBe('/')
      const guest = await asSession(joined.session)
      const households = (await guest.get(`${V1}/households`)).body.households
      expect(households.map((h: { id: string }) => h.id)).toEqual([household])

      // The invitation is used up. A second person cannot start with it.
      const again = await env.client().post(`${V1}/auth/oidc/start`, { inviteToken: token })
      expect(again.status).toBe(404)
    })

    it('rejects an invitation that does not exist before going to the provider', async () => {
      const res = await env.client().post(`${V1}/auth/oidc/start`, { inviteToken: 'nope' })
      expect(res.status).toBe(404)
      expect(env.client().cookie).toBeUndefined()
    })

    it('ignores a setup code once an owner exists', async () => {
      await env.client().post(`${V1}/auth/register`, { username: 'alice', password: PASSWORD })
      const result = await signIn({ sub: 'late' }, { body: { setupCode: 'whatever-code-1234' } })
      expect(location(result.callback!)).toBe('/login?oidc=closed')
    })
  })

  describe('the first account on a new instance', () => {
    const CODE = 'first-account-code'
    beforeEach(() =>
      setup(
        { ORBIT_REGISTRATION: 'first-user-only' },
        { setupGate: OneTimeSetupGate.fromCode(CODE) },
      ),
    )

    it('needs the setup code', async () => {
      const without = await signIn({ sub: 'first' })
      expect(location(without.callback!)).toBe('/login?oidc=setup-code')
      const wrong = await signIn({ sub: 'first' }, { body: { setupCode: 'a-wrong-code-12' } })
      expect(location(wrong.callback!)).toBe('/login?oidc=setup-code')
      expect(wrong.session).toBeUndefined()
    })

    it('creates the owner with the code, and then closes the door', async () => {
      const first = await signIn({ sub: 'first' }, { body: { setupCode: CODE } })
      expect(location(first.callback!)).toBe('/')
      expect(first.session).toBeDefined()
      expect(env.services.auth.setupCodeRequired()).toBe(false)

      const second = await signIn({ sub: 'second' }, { body: { setupCode: CODE } })
      expect(location(second.callback!)).toBe('/login?oidc=closed')
    })
  })

  describe('with password sign-in turned off', () => {
    beforeEach(() => setup({ ORBIT_LOCAL_LOGIN: 'disabled' }))

    it('says so to the login page', async () => {
      const res = await env.client().get(`${V1}/auth/providers`)
      expect(res.body.local).toBe(false)
    })

    it('refuses password login, registration and password sign-up by invitation', async () => {
      const anon = env.client()
      for (const [path, body] of [
        ['/auth/login', { username: 'alice', password: PASSWORD }],
        ['/auth/register', { username: 'alice', password: PASSWORD }],
        ['/invitations/accept', { token: 'x', username: 'alice', password: PASSWORD }],
      ] as const) {
        const res = await anon.post(`${V1}${path}`, body)
        expect(res.status, path).toBe(403)
        expect(res.body.type).toBe('urn:orbit:problem:local-login-disabled')
      }
    })

    it('still signs people in with the provider', async () => {
      const result = await signIn({ sub: 'user-1' })
      const me = await (await asSession(result.session)).get(`${V1}/auth/me`)
      expect(me.status).toBe(200)
    })

    it('leaves the command line recovery path alone', async () => {
      // resetPassword is the operator's tool and is not an HTTP route.
      await expect(
        env.services.auth.resetPassword({ username: 'nobody', password: PASSWORD }),
      ).rejects.toThrow('Not found')
    })
  })

  describe('rate limiting', () => {
    beforeEach(() => setup({}, { authRateLimit: { max: 3, timeWindow: '1 minute' } }))

    it('limits starting and returning like password login', async () => {
      const client = env.client()
      for (let i = 0; i < 3; i += 1) {
        expect((await client.post(`${V1}/auth/oidc/start`, {})).status).toBe(200)
      }
      expect((await client.post(`${V1}/auth/oidc/start`, {})).status).toBe(429)
    })
  })
})

describe('without a provider', () => {
  let env: TestEnv
  beforeEach(async () => {
    env = await createTestEnv({ storage: 'memory' })
  })
  afterEach(() => env.close())

  it('offers only passwords, and 404s the OIDC routes', async () => {
    const client = env.client()
    expect((await client.get(`${V1}/auth/providers`)).body).toEqual({ local: true, oidc: null })
    expect((await client.post(`${V1}/auth/oidc/start`, {})).status).toBe(404)
    const callback = await env.app.inject({
      method: 'GET',
      url: `${V1}/auth/oidc/callback?code=a&state=b`,
    })
    expect(callback.body).toContain('/login?oidc=failed')
  })
})
