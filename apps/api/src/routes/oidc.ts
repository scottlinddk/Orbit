import { timingSafeEqual } from 'node:crypto'
import {
  NotFoundError,
  OidcError,
  OidcIdentityTakenError,
  RegistrationClosedError,
  SetupCodeInvalidError,
} from '@orbit/application'
import { UserId } from '@orbit/domain'
import {
  authProvidersSchema,
  oidcStartRequestSchema,
  oidcStartResponseSchema,
} from '@orbit/contracts'
import type { FastifyReply } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { Config } from '../config.ts'
import {
  OIDC_STATE_TTL_MS,
  oidcCookieName,
  oidcCookieOptions,
  type OidcStateCodec,
} from '../http/oidc-state.ts'
import { cookieName, cookieOptions } from '../http/session.ts'
import { UnauthenticatedError } from '../problem.ts'
import type { Services } from '../services.ts'
import { errors } from './schemas.ts'

export interface OidcRouteOptions {
  services: Services
  config: Config
  codec: OidcStateCodec
  now?: (() => number) | undefined
  /** The same limit as password login. */
  rateLimit: { max: number; timeWindow: string }
}

/** Where the login page learns what went wrong. Short codes, never provider text. */
export type OidcLandingError =
  'expired' | 'denied' | 'failed' | 'closed' | 'setup-code' | 'invite' | 'taken'

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * The page the callback answers with. A `SameSite=Strict` session cookie is not sent on a request
 * that began at the provider, and that includes a plain redirect from here. So the callback sets
 * the cookie and then lets the page move on by itself: that second navigation starts on Orbit's
 * own origin and carries the cookie. `default-src 'none'` does not block a refresh.
 */
function landing(reply: FastifyReply, path: string) {
  const escaped = path.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  return reply
    .code(200)
    .type('text/html; charset=utf-8')
    .header('refresh', `0; url=${path}`)
    .send(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${escaped}"><title>Orbit</title></head><body><p><a href="${escaped}">Continue to Orbit</a></p></body></html>`,
    )
}

const loginError = (code: OidcLandingError) => `/login?oidc=${code}`

export const oidcRoutes =
  ({
    services,
    config,
    codec,
    rateLimit,
    now = Date.now,
  }: OidcRouteOptions): FastifyPluginAsyncZod =>
  async (app) => {
    const { auth, oidc } = services
    const sessionName = cookieName(config)
    const flowName = oidcCookieName(config)

    app.get(
      '/auth/providers',
      {
        schema: {
          tags: ['auth'],
          summary: 'How people can sign in on this instance',
          description:
            'Public. Tells the login page whether to show the password form and the single-sign-on button.',
          response: { 200: authProvidersSchema, 429: errors[429] },
        },
      },
      async () => ({
        local: auth.localLoginEnabled(),
        oidc: oidc ? { label: oidc.label } : null,
      }),
    )

    app.post(
      '/auth/oidc/start',
      {
        config: { rateLimit },
        schema: {
          tags: ['auth'],
          summary: 'Start signing in with the identity provider',
          description:
            'Returns the address to send the browser to and sets a short-lived HttpOnly cookie that the callback checks. Pass an invitation token to join a household, or the setup code for the first account of a new instance. With `link` the caller must be signed in, and the provider account is linked to them instead of signing in. 404 when no provider is configured.',
          body: oidcStartRequestSchema,
          response: {
            200: oidcStartResponseSchema,
            400: errors[400],
            401: errors[401],
            404: errors[404],
            429: errors[429],
            502: errors[502],
          },
        },
      },
      async (request, reply) => {
        if (!oidc) throw new NotFoundError()
        let linkUserId: string | undefined
        if (request.body.link) {
          const token = request.cookies[sessionName]
          const actor = token ? await auth.authenticate(token) : undefined
          if (!actor) throw new UnauthenticatedError()
          linkUserId = actor.userId
        } else if (request.body.inviteToken) {
          // Fail now, with the same 404 as everywhere, rather than after a trip to the provider.
          await auth.previewInvitation(request.body.inviteToken)
        }
        const flow = await oidc.authorize()
        reply.setCookie(
          flowName,
          codec.seal({
            state: flow.state,
            nonce: flow.nonce,
            codeVerifier: flow.codeVerifier,
            expiresAt: now() + OIDC_STATE_TTL_MS,
            inviteToken: linkUserId ? undefined : request.body.inviteToken,
            setupCode: linkUserId ? undefined : request.body.setupCode,
            linkUserId,
          }),
          { ...oidcCookieOptions(config), maxAge: OIDC_STATE_TTL_MS / 1000 },
        )
        return { authorizationUrl: flow.url }
      },
    )

    app.get(
      '/auth/oidc/callback',
      {
        config: { rateLimit },
        schema: {
          tags: ['auth'],
          summary: 'Where the identity provider sends the browser back',
          description:
            'Not called by scripts. Checks the state cookie, exchanges the code, verifies the ID token and signs in (or links). Always answers with a small HTML page that sets the session cookie and moves on to the app, because a Strict cookie is not sent on a navigation that began at the provider. Failures go to the login page with a short `oidc` code.',
          querystring: z.object({
            code: z.string().max(2048).optional(),
            state: z.string().max(512).optional(),
            error: z.string().max(128).optional(),
          }),
          response: {
            200: z.string().describe('HTML that continues to the app'),
            429: errors[429],
          },
        },
      },
      async (request, reply) => {
        // The flow is single use whatever happens next.
        const flow = codec.open(request.cookies[flowName])
        reply.clearCookie(flowName, oidcCookieOptions(config))
        if (!oidc) return landing(reply, loginError('failed'))
        if (!flow) return landing(reply, loginError('expired'))
        const { code, state, error } = request.query
        if (error) return landing(reply, loginError('denied'))
        if (!code || !state || !safeEqual(state, flow.state)) {
          return landing(reply, loginError('failed'))
        }
        try {
          const identity = await oidc.exchange({
            code,
            codeVerifier: flow.codeVerifier,
            nonce: flow.nonce,
          })
          const result = await auth.signInWithIdentity({
            identity,
            inviteToken: flow.inviteToken,
            setupCode: flow.setupCode,
            linkUserId: flow.linkUserId ? UserId(flow.linkUserId) : undefined,
          })
          if (result.kind === 'linked') return landing(reply, '/?oidc=linked')
          reply.setCookie(sessionName, result.login.token, {
            ...cookieOptions(config),
            expires: result.login.expiresAt,
          })
          return landing(reply, '/')
        } catch (caught) {
          if (caught instanceof OidcError) {
            request.log.warn(
              { reason: caught.reason, detail: caught.message },
              'oidc sign-in failed',
            )
            return landing(reply, loginError('failed'))
          }
          if (caught instanceof RegistrationClosedError) return landing(reply, loginError('closed'))
          if (caught instanceof SetupCodeInvalidError)
            return landing(reply, loginError('setup-code'))
          if (caught instanceof OidcIdentityTakenError) return landing(reply, loginError('taken'))
          if (caught instanceof NotFoundError) return landing(reply, loginError('invite'))
          throw caught
        }
      },
    )
  }
