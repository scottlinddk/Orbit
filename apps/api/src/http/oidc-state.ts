import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Config } from '../config.ts'

/** How long a sign-in may take between leaving Orbit and coming back. */
export const OIDC_STATE_TTL_MS = 10 * 60 * 1000

/** What Orbit must remember between sending the browser to the provider and its return. */
export interface OidcFlowState {
  readonly state: string
  readonly nonce: string
  readonly codeVerifier: string
  /** Milliseconds since the epoch. */
  readonly expiresAt: number
  readonly inviteToken?: string | undefined
  readonly setupCode?: string | undefined
  /** The signed-in user who asked to link, taken from their session when the flow started. */
  readonly linkUserId?: string | undefined
}

/**
 * Signs the flow state, so a cookie the browser hands back cannot have been written by anyone but
 * this server. The state is signed, not encrypted: it only ever travels to the person who started
 * the flow, in an HttpOnly cookie, and the provider never sees it.
 */
export interface OidcStateCodec {
  seal(state: OidcFlowState): string
  /** The state, or undefined when the value is forged, malformed or expired. */
  open(value: string | undefined): OidcFlowState | undefined
}

/**
 * The key comes from ORBIT_SECRET_KEY when there is one. Otherwise it is random per process, which
 * only costs a person whose sign-in straddles a restart one more try.
 */
export function createStateCodec(
  secretKey: string | undefined,
  now: () => number = Date.now,
): OidcStateCodec {
  const key = Buffer.from(
    hkdfSync('sha256', secretKey ?? randomBytes(32), 'orbit-oidc-state-v1', 'oidc flow state', 32),
  )
  const sign = (body: string) => createHmac('sha256', key).update(body).digest()
  return {
    seal(state) {
      const body = Buffer.from(JSON.stringify(state)).toString('base64url')
      return `${body}.${sign(body).toString('base64url')}`
    },
    open(value) {
      if (!value || value.length > 4096) return undefined
      const [body, signature, ...rest] = value.split('.')
      if (!body || !signature || rest.length > 0) return undefined
      const given = Buffer.from(signature, 'base64url')
      const expected = sign(body)
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined
      try {
        const state = JSON.parse(Buffer.from(body, 'base64url').toString()) as OidcFlowState
        if (typeof state.expiresAt !== 'number' || state.expiresAt <= now()) return undefined
        return state
      } catch {
        return undefined
      }
    },
  }
}

/**
 * Lax, not Strict: the callback is a navigation that starts at the provider, and a Strict cookie
 * would not be sent with it. The cookie holds nothing a forged callback could use without the
 * matching `state` from the provider's redirect.
 */
export const oidcCookieName = (config: Pick<Config, 'secureCookies'>) =>
  config.secureCookies ? '__Host-orbit_oidc' : 'orbit_oidc'

export function oidcCookieOptions(config: Pick<Config, 'secureCookies'>) {
  return {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'lax' as const,
    path: '/',
  }
}
