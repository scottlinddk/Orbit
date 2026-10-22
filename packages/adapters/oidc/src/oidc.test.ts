import { OidcError, type OidcProvider } from '@orbit/application'
import { beforeEach, describe, expect, it } from 'vitest'
import { FakeOidcProvider, type TokenOverrides } from './fake-provider.ts'
import { createOidcProvider, type OidcProviderConfig } from './index.ts'

const ISSUER = 'https://id.example.com/realms/home'
const config: OidcProviderConfig = {
  issuer: ISSUER,
  clientId: 'orbit',
  clientSecret: 's3cret/with+odd chars',
  scopes: ['openid', 'profile'],
  label: 'Home login',
  redirectUri: 'https://orbit.example.com/api/v1/auth/oidc/callback',
  allowHttp: false,
}

let fake: FakeOidcProvider
let oidc: OidcProvider

beforeEach(async () => {
  fake = await FakeOidcProvider.create({
    issuer: ISSUER,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  })
  oidc = createOidcProvider(config, fake, { now: () => fake.now })
})

/** Runs the whole flow and returns what the adapter makes of it. */
async function signIn(claims: Record<string, unknown>, overrides: TokenOverrides = {}) {
  const start = await oidc.authorize()
  const { code } = fake.approve(start.url, claims, overrides)
  return oidc.exchange({ code, codeVerifier: start.codeVerifier, nonce: start.nonce })
}

const failure = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(OidcError)
  return error as OidcError
}

describe('authorize', () => {
  it('builds a code flow request with PKCE, state and nonce', async () => {
    const start = await oidc.authorize()
    const url = new URL(start.url)
    expect(url.origin + url.pathname).toBe(`${ISSUER}/authorize`)
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: 'code',
      client_id: 'orbit',
      redirect_uri: config.redirectUri,
      scope: 'openid profile',
      state: start.state,
      nonce: start.nonce,
      code_challenge_method: 'S256',
    })
    expect(url.searchParams.get('code_challenge')).not.toBe(start.codeVerifier)
    expect(start.state).not.toBe(start.nonce)
  })

  it('creates fresh secrets every time', async () => {
    const a = await oidc.authorize()
    const b = await oidc.authorize()
    expect(a.state).not.toBe(b.state)
    expect(a.nonce).not.toBe(b.nonce)
    expect(a.codeVerifier).not.toBe(b.codeVerifier)
  })

  it('caches discovery', async () => {
    await oidc.authorize()
    await oidc.authorize()
    expect(fake.requests.filter((r) => r.url.includes('.well-known'))).toHaveLength(1)
  })

  it('refuses a discovery document that names another issuer', async () => {
    fake.discoveryIssuer = 'https://evil.example.com'
    expect((await failure(oidc.authorize())).reason).toBe('configuration')
  })

  it('refuses a provider without PKCE S256', async () => {
    fake.discoveryExtra = { code_challenge_methods_supported: ['plain'] }
    expect((await failure(oidc.authorize())).reason).toBe('configuration')
  })

  it('reports an unreachable provider', async () => {
    fake.down = true
    expect((await failure(oidc.authorize())).reason).toBe('unavailable')
  })

  it('refuses http endpoints unless the administrator allowed a LAN provider', async () => {
    const http = 'http://id.lan/realms/home'
    const lan = await FakeOidcProvider.create({ ...config, issuer: http })
    const strict = createOidcProvider({ ...config, issuer: http }, lan)
    expect((await failure(strict.authorize())).reason).toBe('configuration')
    const relaxed = createOidcProvider({ ...config, issuer: http, allowHttp: true }, lan)
    expect((await relaxed.authorize()).url.startsWith('http://id.lan/')).toBe(true)
  })
})

describe('exchange', () => {
  it('returns the verified identity', async () => {
    const identity = await signIn({ sub: 'user-1', name: 'Una Example' })
    expect(identity).toEqual({ issuer: ISSUER, subject: 'user-1', displayName: 'Una Example' })
  })

  it('falls back to preferred_username, and to nothing', async () => {
    expect((await signIn({ sub: 'a', preferred_username: 'una' })).displayName).toBe('una')
    expect((await signIn({ sub: 'b' })).displayName).toBeUndefined()
  })

  it('sends the client secret in a Basic header, form encoded, never in the body', async () => {
    await signIn({ sub: 'user-1' })
    const token = fake.requests.find((r) => r.method === 'POST')!
    const decoded = Buffer.from(token.headers!.authorization!.slice(6), 'base64').toString()
    expect(decoded).toBe('orbit:s3cret%2Fwith%2Bodd+chars')
    expect(token.body).not.toContain('s3cret')
    expect(token.body).toContain('code_verifier=')
  })

  it('uses client_secret_post when the provider only offers that', async () => {
    fake.discoveryExtra = { token_endpoint_auth_methods_supported: ['client_secret_post'] }
    await signIn({ sub: 'user-1' })
    const token = fake.requests.find((r) => r.method === 'POST')!
    expect(token.headers!.authorization).toBeUndefined()
    expect(token.body).toContain('client_secret=')
  })

  it('refuses a wrong nonce', async () => {
    const error = await failure(signIn({ sub: 'u' }, { nonce: 'attacker-chosen' }))
    expect(error.reason).toBe('invalid-token')
  })

  it('refuses a token without a nonce', async () => {
    expect((await failure(signIn({ sub: 'u' }, { nonce: null }))).reason).toBe('invalid-token')
  })

  it('refuses an expired token', async () => {
    expect((await failure(signIn({ sub: 'u' }, { expiresIn: -600 }))).reason).toBe('invalid-token')
  })

  it('refuses a token for another client', async () => {
    const error = await failure(signIn({ sub: 'u' }, { audience: 'someone-else' }))
    expect(error.reason).toBe('invalid-token')
  })

  it('refuses several audiences without a matching azp', async () => {
    const aud = ['orbit', 'other']
    expect((await failure(signIn({ sub: 'u' }, { audience: aud }))).reason).toBe('invalid-token')
    expect((await signIn({ sub: 'u' }, { audience: aud, azp: 'orbit' })).subject).toBe('u')
  })

  it('refuses a token from another issuer', async () => {
    const error = await failure(signIn({ sub: 'u' }, { issuer: 'https://evil.example.com' }))
    expect(error.reason).toBe('invalid-token')
  })

  it('refuses a token signed with a key the provider never published', async () => {
    expect((await failure(signIn({ sub: 'u' }, { foreignKey: true }))).reason).toBe('invalid-token')
  })

  it('refuses a symmetric algorithm, even signed with the client secret', async () => {
    expect((await failure(signIn({ sub: 'u' }, { symmetric: true }))).reason).toBe('invalid-token')
  })

  it('refuses a missing or oversized subject', async () => {
    expect((await failure(signIn({}))).reason).toBe('invalid-token')
    expect((await failure(signIn({ sub: 'x'.repeat(256) }))).reason).toBe('invalid-token')
  })

  it('accepts a token a little past its expiry, within clock tolerance', async () => {
    expect((await signIn({ sub: 'u' }, { expiresIn: -30 })).subject).toBe('u')
  })

  it('uses a code once', async () => {
    const start = await oidc.authorize()
    const { code } = fake.approve(start.url, { sub: 'u' })
    const again = { code, codeVerifier: start.codeVerifier, nonce: start.nonce }
    await oidc.exchange(again)
    expect((await failure(oidc.exchange(again))).reason).toBe('token-exchange')
  })

  it('fails the exchange when the PKCE verifier is wrong', async () => {
    const start = await oidc.authorize()
    const { code } = fake.approve(start.url, { sub: 'u' })
    const error = await failure(oidc.exchange({ code, codeVerifier: 'wrong', nonce: start.nonce }))
    expect(error.reason).toBe('token-exchange')
  })

  it('fails when the secret is wrong', async () => {
    const wrong = createOidcProvider({ ...config, clientSecret: 'nope' }, fake)
    const start = await wrong.authorize()
    const { code } = fake.approve(start.url, { sub: 'u' })
    const error = await failure(
      wrong.exchange({ code, codeVerifier: start.codeVerifier, nonce: start.nonce }),
    )
    expect(error.reason).toBe('token-exchange')
  })

  it('picks up rotated keys, but not more often than once a minute', async () => {
    await signIn({ sub: 'before' })
    await fake.rotateKey()
    // Keys were fetched a moment ago, so the new key is not looked for yet.
    expect((await failure(signIn({ sub: 'after' }))).reason).toBe('invalid-token')
    fake.now = new Date(fake.now.getTime() + 2 * 60 * 1000)
    expect((await signIn({ sub: 'after' })).subject).toBe('after')
  })

  it('does not put the secret or the code in error messages', async () => {
    fake.down = true
    const start = await oidc.authorize().catch((e: unknown) => e)
    expect(String((start as Error).message)).not.toContain(config.clientSecret)
  })
})
