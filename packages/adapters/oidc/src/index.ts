import { createHash, randomBytes } from 'node:crypto'
import {
  OidcError,
  type EgressFetcher,
  type OidcAuthorization,
  type OidcIdentity,
  type OidcProvider,
} from '@orbit/application'
import { createLocalJWKSet, errors as joseErrors, jwtVerify, type JSONWebKeySet } from 'jose'

export interface OidcProviderConfig {
  /** Exactly as the provider names itself, without a trailing slash. */
  readonly issuer: string
  readonly clientId: string
  readonly clientSecret: string
  /** Always contains `openid`. */
  readonly scopes: readonly string[]
  readonly label: string
  /** ORBIT_PUBLIC_URL + /api/v1/auth/oidc/callback. */
  readonly redirectUri: string
  /**
   * Allow `http` endpoints. Only for a provider on the LAN whose host the administrator listed in
   * ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS. Everything else must be https.
   */
  readonly allowHttp: boolean
}

export interface OidcProviderOptions {
  readonly now?: () => Date
  /** How long discovery and keys are kept. */
  readonly cacheMs?: number
}

const MAX_BYTES = 256 * 1024
const TIMEOUT_MS = 10_000
const DEFAULT_CACHE_MS = 10 * 60 * 1000
/** A token signed with an unknown key may mean the provider rotated keys, but do not refetch more often than this. */
const MIN_KEY_REFRESH_MS = 60 * 1000
/** Asymmetric algorithms only. A symmetric one would let the shared secret forge tokens. */
const ALGORITHMS = [
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'ES512',
  'EdDSA',
]
const CLOCK_TOLERANCE_SECONDS = 60

interface Discovery {
  readonly authorizationEndpoint: string
  readonly tokenEndpoint: string
  readonly jwksUri: string
  readonly useClientSecretPost: boolean
}

const base64url = (bytes: Buffer) => bytes.toString('base64url')

/** Form encoding as RFC 6749 requires it, which is stricter than encodeURIComponent for Basic credentials. */
const formEncode = (value: string) => encodeURIComponent(value).replace(/%20/g, '+')

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function createOidcProvider(
  config: OidcProviderConfig,
  fetcher: EgressFetcher,
  options: OidcProviderOptions = {},
): OidcProvider {
  const now = options.now ?? (() => new Date())
  const cacheMs = options.cacheMs ?? DEFAULT_CACHE_MS
  let discovery: { value: Discovery; at: number } | undefined
  let keys: { value: ReturnType<typeof createLocalJWKSet>; at: number; uri: string } | undefined

  function checkEndpoint(name: string, value: unknown): string {
    if (typeof value !== 'string') {
      throw new OidcError('configuration', `The provider's ${name} is missing`)
    }
    let url: URL
    try {
      url = new URL(value)
    } catch {
      throw new OidcError('configuration', `The provider's ${name} is not a valid address`)
    }
    const allowed = url.protocol === 'https:' || (config.allowHttp && url.protocol === 'http:')
    if (!allowed || url.username !== '' || url.password !== '') {
      throw new OidcError('configuration', `The provider's ${name} must be an https address`)
    }
    return url.toString()
  }

  async function getJson(url: string): Promise<unknown> {
    let response
    try {
      response = await fetcher.fetchText({
        url,
        maxBytes: MAX_BYTES,
        timeoutMs: TIMEOUT_MS,
        headers: { accept: 'application/json' },
      })
    } catch (error) {
      throw new OidcError('unavailable', errorMessage('The provider could not be reached', error))
    }
    if (response.status !== 200) {
      throw new OidcError('unavailable', `The provider answered ${response.status}`)
    }
    try {
      return JSON.parse(response.body)
    } catch {
      throw new OidcError('unavailable', 'The provider sent something that is not JSON')
    }
  }

  async function discover(): Promise<Discovery> {
    if (discovery && now().getTime() - discovery.at < cacheMs) return discovery.value
    const base = config.issuer.replace(/\/+$/, '')
    const document = await getJson(
      checkEndpoint('issuer', `${base}/.well-known/openid-configuration`),
    )
    if (!isObject(document))
      throw new OidcError('configuration', 'The discovery document is invalid')
    // A different issuer in the document means this is not the provider we were configured for.
    if (document.issuer !== config.issuer) {
      throw new OidcError('configuration', 'The discovery document names a different issuer')
    }
    const challengeMethods = document.code_challenge_methods_supported
    if (Array.isArray(challengeMethods) && !challengeMethods.includes('S256')) {
      throw new OidcError('configuration', 'The provider does not support PKCE with S256')
    }
    const authMethods = document.token_endpoint_auth_methods_supported
    const useClientSecretPost =
      Array.isArray(authMethods) &&
      !authMethods.includes('client_secret_basic') &&
      authMethods.includes('client_secret_post')
    const value: Discovery = {
      authorizationEndpoint: checkEndpoint(
        'authorization endpoint',
        document.authorization_endpoint,
      ),
      tokenEndpoint: checkEndpoint('token endpoint', document.token_endpoint),
      jwksUri: checkEndpoint('key set address', document.jwks_uri),
      useClientSecretPost,
    }
    discovery = { value, at: now().getTime() }
    return value
  }

  async function loadKeys(uri: string, force: boolean) {
    const t = now().getTime()
    if (keys && keys.uri === uri && !force && t - keys.at < cacheMs) return keys.value
    if (keys && keys.uri === uri && force && t - keys.at < MIN_KEY_REFRESH_MS) return keys.value
    const document = await getJson(uri)
    if (!isObject(document) || !Array.isArray(document.keys)) {
      throw new OidcError('unavailable', 'The provider sent an invalid key set')
    }
    const value = createLocalJWKSet(document as unknown as JSONWebKeySet)
    keys = { value, at: t, uri }
    return value
  }

  async function verify(idToken: string, uri: string, nonce: string): Promise<OidcIdentity> {
    const check = async (force: boolean) =>
      jwtVerify(idToken, await loadKeys(uri, force), {
        issuer: config.issuer,
        audience: config.clientId,
        algorithms: ALGORITHMS,
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
        currentDate: now(),
        requiredClaims: ['exp', 'iat', 'sub'],
      })
    let payload
    try {
      try {
        ;({ payload } = await check(false))
      } catch (error) {
        // The provider may have rotated its keys since they were cached.
        if (!(error instanceof joseErrors.JWKSNoMatchingKey)) throw error
        ;({ payload } = await check(true))
      }
    } catch (error) {
      if (error instanceof OidcError) throw error
      throw new OidcError('invalid-token', 'The ID token could not be verified')
    }
    if (payload.nonce !== nonce)
      throw new OidcError('invalid-token', 'The ID token nonce does not match')
    // With several audiences, the token must say it was issued to this client.
    if (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== config.clientId) {
      throw new OidcError('invalid-token', 'The ID token was issued to a different client')
    }
    const subject = payload.sub
    if (typeof subject !== 'string' || subject === '' || subject.length > 255) {
      throw new OidcError('invalid-token', 'The ID token subject is not valid')
    }
    const name = [payload.name, payload.preferred_username].find(
      (v): v is string => typeof v === 'string' && v.trim() !== '',
    )
    return { issuer: config.issuer, subject, displayName: name }
  }

  return {
    label: config.label,

    async authorize(): Promise<OidcAuthorization> {
      const found = await discover()
      const state = base64url(randomBytes(32))
      const nonce = base64url(randomBytes(32))
      const codeVerifier = base64url(randomBytes(32))
      const challenge = base64url(createHash('sha256').update(codeVerifier).digest())
      const url = new URL(found.authorizationEndpoint)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', config.clientId)
      url.searchParams.set('redirect_uri', config.redirectUri)
      url.searchParams.set('scope', config.scopes.join(' '))
      url.searchParams.set('state', state)
      url.searchParams.set('nonce', nonce)
      url.searchParams.set('code_challenge', challenge)
      url.searchParams.set('code_challenge_method', 'S256')
      return { url: url.toString(), state, nonce, codeVerifier }
    },

    async exchange({ code, codeVerifier, nonce }): Promise<OidcIdentity> {
      const found = await discover()
      const form = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
        code_verifier: codeVerifier,
      })
      const headers: Record<string, string> = {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      }
      if (found.useClientSecretPost) {
        form.set('client_id', config.clientId)
        form.set('client_secret', config.clientSecret)
      } else {
        const credentials = `${formEncode(config.clientId)}:${formEncode(config.clientSecret)}`
        headers.authorization = `Basic ${Buffer.from(credentials).toString('base64')}`
      }
      let response
      try {
        response = await fetcher.fetchText({
          url: found.tokenEndpoint,
          method: 'POST',
          body: form.toString(),
          headers,
          maxBytes: MAX_BYTES,
          timeoutMs: TIMEOUT_MS,
        })
      } catch (error) {
        throw new OidcError('unavailable', errorMessage('The token request failed', error))
      }
      if (response.status !== 200) {
        throw new OidcError('token-exchange', `The token endpoint answered ${response.status}`)
      }
      let body: unknown
      try {
        body = JSON.parse(response.body)
      } catch {
        throw new OidcError('token-exchange', 'The token endpoint sent something that is not JSON')
      }
      if (!isObject(body) || typeof body.id_token !== 'string') {
        throw new OidcError('token-exchange', 'The token response has no ID token')
      }
      return verify(body.id_token, found.jwksUri, nonce)
    },
  }
}

function errorMessage(prefix: string, error: unknown): string {
  // Egress messages are written to be shown to people and never name internal addresses.
  return error instanceof Error && error.name === 'EgressDeniedError'
    ? `${prefix}: ${error.message}`
    : prefix
}
