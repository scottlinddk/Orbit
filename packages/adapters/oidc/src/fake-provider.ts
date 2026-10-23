import { createHash, randomBytes } from 'node:crypto'
import type { EgressFetcher, EgressRequest, EgressResponse } from '@orbit/application'
import { SignJWT, exportJWK, generateKeyPair, type JWK } from 'jose'

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>

export interface FakeProviderOptions {
  readonly issuer: string
  readonly clientId: string
  readonly clientSecret: string
}

/** What a test can bend about the ID token the provider issues. */
export interface TokenOverrides {
  readonly issuer?: string
  readonly audience?: string | string[]
  readonly azp?: string
  readonly nonce?: string | null
  /** Seconds after "now". Negative for an expired token. */
  readonly expiresIn?: number
  /** Sign with a key the provider never published. */
  readonly foreignKey?: boolean
  /** Sign with HS256 and the client secret, which a verifier must refuse. */
  readonly symmetric?: boolean
}

export interface Approval {
  readonly code: string
  readonly state: string
}

interface PendingCode {
  readonly clientId: string
  readonly redirectUri: string
  readonly nonce: string
  readonly challenge: string
  readonly claims: Record<string, unknown>
  readonly overrides: TokenOverrides
}

/**
 * An OpenID Connect provider that lives in the test process. It is an `EgressFetcher`, so the real
 * adapter runs against it unchanged: discovery, key set and token endpoint answer from memory,
 * and the ID tokens are really signed.
 */
export class FakeOidcProvider implements EgressFetcher {
  readonly issuer: string
  readonly requests: EgressRequest[] = []
  /** Moves the provider's clock. The adapter under test must use the same one. */
  now = new Date('2026-01-01T12:00:00Z')
  /** Set to make every request fail the way an unreachable provider would. */
  down = false
  /** Extra discovery fields, for example `token_endpoint_auth_methods_supported`. */
  discoveryExtra: Record<string, unknown> = {}
  /** Replaces the `issuer` in the discovery document. */
  discoveryIssuer: string | undefined
  readonly #options: FakeProviderOptions
  readonly #codes = new Map<string, PendingCode>()
  #key!: KeyPair
  #foreign!: KeyPair
  #jwk!: JWK

  private constructor(options: FakeProviderOptions) {
    this.#options = options
    this.issuer = options.issuer
  }

  static async create(options: FakeProviderOptions): Promise<FakeOidcProvider> {
    const provider = new FakeOidcProvider(options)
    provider.#key = await generateKeyPair('ES256')
    provider.#foreign = await generateKeyPair('ES256')
    provider.#jwk = {
      ...(await exportJWK(provider.#key.publicKey)),
      kid: 'k1',
      alg: 'ES256',
      use: 'sig',
    }
    return provider
  }

  /** Replaces the published key, as a provider does when it rotates keys. */
  async rotateKey(): Promise<void> {
    this.#key = await generateKeyPair('ES256')
    this.#jwk = { ...(await exportJWK(this.#key.publicKey)), kid: 'k2', alg: 'ES256', use: 'sig' }
  }

  /**
   * Plays the person who signs in at the provider: takes the authorization URL the app built and
   * returns the `code` and `state` the browser would carry back to the callback.
   */
  approve(
    authorizationUrl: string,
    claims: Record<string, unknown>,
    overrides: TokenOverrides = {},
  ): Approval {
    const url = new URL(authorizationUrl)
    const param = (name: string) => url.searchParams.get(name) ?? ''
    if (param('response_type') !== 'code') throw new Error('not a code flow request')
    if (param('code_challenge_method') !== 'S256') throw new Error('PKCE S256 missing')
    const code = randomBytes(16).toString('hex')
    this.#codes.set(code, {
      clientId: param('client_id'),
      redirectUri: param('redirect_uri'),
      nonce: param('nonce'),
      challenge: param('code_challenge'),
      claims,
      overrides,
    })
    return { code, state: param('state') }
  }

  async fetchText(request: EgressRequest): Promise<EgressResponse> {
    this.requests.push(request)
    if (this.down) throw new Error('connection refused')
    const url = new URL(request.url)
    const reply = (status: number, body: unknown): EgressResponse => ({
      status,
      body: JSON.stringify(body),
      contentType: 'application/json',
      finalUrl: request.url,
    })
    if (url.pathname.endsWith('/.well-known/openid-configuration')) {
      return reply(200, {
        issuer: this.discoveryIssuer ?? this.issuer,
        authorization_endpoint: `${this.issuer}/authorize`,
        token_endpoint: `${this.issuer}/token`,
        jwks_uri: `${this.issuer}/jwks`,
        code_challenge_methods_supported: ['S256'],
        ...this.discoveryExtra,
      })
    }
    if (url.pathname.endsWith('/jwks')) return reply(200, { keys: [this.#jwk] })
    if (url.pathname.endsWith('/token') && request.method === 'POST')
      return this.#token(request, reply)
    return reply(404, { error: 'not_found' })
  }

  async #token(
    request: EgressRequest,
    reply: (status: number, body: unknown) => EgressResponse,
  ): Promise<EgressResponse> {
    const form = new URLSearchParams(request.body ?? '')
    const authorization = request.headers?.authorization
    let clientId = form.get('client_id')
    let secret = form.get('client_secret')
    if (authorization?.startsWith('Basic ')) {
      const [id, ...rest] = Buffer.from(authorization.slice(6), 'base64').toString().split(':')
      clientId = decodeURIComponent((id ?? '').replace(/\+/g, ' '))
      secret = decodeURIComponent(rest.join(':').replace(/\+/g, ' '))
    }
    if (clientId !== this.#options.clientId || secret !== this.#options.clientSecret) {
      return reply(401, { error: 'invalid_client' })
    }
    const pending = this.#codes.get(form.get('code') ?? '')
    // A code works once, whatever happens next.
    this.#codes.delete(form.get('code') ?? '')
    const challenge = createHash('sha256')
      .update(form.get('code_verifier') ?? '')
      .digest('base64url')
    if (
      !pending ||
      form.get('grant_type') !== 'authorization_code' ||
      pending.redirectUri !== form.get('redirect_uri') ||
      pending.challenge !== challenge
    ) {
      return reply(400, { error: 'invalid_grant' })
    }
    return reply(200, {
      token_type: 'Bearer',
      access_token: 'not-used',
      id_token: await this.#sign(pending),
    })
  }

  async #sign(pending: PendingCode): Promise<string> {
    const o = pending.overrides
    const iat = Math.floor(this.now.getTime() / 1000)
    const claims: Record<string, unknown> = { ...pending.claims }
    if (o.nonce !== null) claims.nonce = o.nonce ?? pending.nonce
    if (o.azp) claims.azp = o.azp
    const jwt = new SignJWT(claims as never)
      .setIssuer(o.issuer ?? this.issuer)
      .setAudience(o.audience ?? pending.clientId)
      .setIssuedAt(iat)
      .setExpirationTime(iat + (o.expiresIn ?? 300))
    if (o.symmetric) {
      return jwt
        .setProtectedHeader({ alg: 'HS256', kid: 'k1' })
        .sign(new TextEncoder().encode(this.#options.clientSecret.padEnd(32, '!')))
    }
    return jwt
      .setProtectedHeader({ alg: 'ES256', kid: o.foreignKey ? 'k1' : this.#jwk.kid! })
      .sign((o.foreignKey ? this.#foreign : this.#key).privateKey)
  }
}
