import {
  acceptInvitationRequestSchema,
  invitationPreviewSchema,
  invitationTokenRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  sessionUserSchema,
  setupStatusSchema,
} from '@orbit/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Config } from '../config.ts'
import { actorOf, cookieName, cookieOptions } from '../http/session.ts'
import type { Services } from '../services.ts'
import { errors, noContent, sessionSecurity } from './schemas.ts'

export interface AuthRouteOptions {
  services: Services
  config: Config
  requireActor: (request: never, reply: never) => Promise<void>
  /** Stricter limit for the endpoints that accept passwords. */
  rateLimit: { max: number; timeWindow: string }
}

export const authRoutes =
  ({ services, config, requireActor, rateLimit }: AuthRouteOptions): FastifyPluginAsyncZod =>
  async (app) => {
    const { auth, useCases } = services
    const name = cookieName(config)

    app.get(
      '/auth/setup',
      {
        schema: {
          tags: ['auth'],
          summary: 'Whether creating the first account needs a setup code',
          description:
            'True only on a new instance that has no owner yet. The code is printed once in the server log at start. It is never returned by the API.',
          response: { 200: setupStatusSchema, 429: errors[429] },
        },
      },
      async () => ({ setupCodeRequired: auth.setupCodeRequired() }),
    )

    app.post(
      '/auth/register',
      {
        config: { rateLimit },
        schema: {
          tags: ['auth'],
          summary: 'Create an account',
          description:
            'On a new instance the first account can be created with the setup code from the server log (see GET /auth/setup). After that this is closed unless ORBIT_REGISTRATION=open. It does not sign you in.',
          body: registerRequestSchema,
          response: {
            201: sessionUserSchema,
            400: errors[400],
            403: errors[403],
            409: errors[409],
            422: errors[422],
            429: errors[429],
          },
        },
      },
      async (request, reply) => {
        const user = await auth.register(request.body)
        return reply.code(201).send({ id: user.id, displayName: user.displayName })
      },
    )

    app.post(
      '/auth/login',
      {
        config: { rateLimit },
        schema: {
          tags: ['auth'],
          summary: 'Sign in',
          description:
            'Sets an HttpOnly session cookie. The response body never contains the session token.',
          body: loginRequestSchema,
          response: {
            200: sessionUserSchema,
            400: errors[400],
            401: errors[401],
            429: errors[429],
          },
        },
      },
      async (request, reply) => {
        const result = await auth.login(request.body)
        reply.setCookie(name, result.token, { ...cookieOptions(config), expires: result.expiresAt })
        const user = await useCases.getProfile(result.userId)
        return reply.send({ id: user.id, displayName: user.displayName })
      },
    )

    app.post(
      '/auth/logout',
      {
        onRequest: [requireActor as never],
        schema: {
          tags: ['auth'],
          summary: 'Sign out',
          security: sessionSecurity,
          response: { 204: noContent, 401: errors[401] },
        },
      },
      async (request, reply) => {
        const token = request.cookies[name]
        if (token) await auth.logout(token)
        reply.clearCookie(name, cookieOptions(config))
        return reply.code(204).send(null)
      },
    )

    app.get(
      '/auth/me',
      {
        onRequest: [requireActor as never],
        schema: {
          tags: ['auth'],
          summary: 'The signed-in user',
          security: sessionSecurity,
          response: { 200: sessionUserSchema, 401: errors[401] },
        },
      },
      async (request) => {
        const user = await useCases.getProfile(actorOf(request).userId)
        return { id: user.id, displayName: user.displayName }
      },
    )

    app.post(
      '/invitations/preview',
      {
        config: { rateLimit },
        schema: {
          tags: ['invitations'],
          summary: 'What an invitation link offers',
          description:
            'Public, because the invitee has no account yet. The token travels in the body, never in the URL, so it stays out of access logs. An unknown, expired, revoked or used token all answer 404.',
          body: invitationTokenRequestSchema,
          response: {
            200: invitationPreviewSchema,
            400: errors[400],
            404: errors[404],
            429: errors[429],
          },
        },
      },
      async (request) => auth.previewInvitation(request.body.token),
    )

    app.post(
      '/invitations/accept',
      {
        config: { rateLimit },
        schema: {
          tags: ['invitations'],
          summary: 'Join a household with an invitation',
          description:
            'Creates the account and adds it to the household in one step, using up the invitation. Works while registration is closed. It does not sign you in.',
          body: acceptInvitationRequestSchema,
          response: {
            201: sessionUserSchema,
            400: errors[400],
            404: errors[404],
            409: errors[409],
            422: errors[422],
            429: errors[429],
          },
        },
      },
      async (request, reply) => {
        const user = await auth.acceptInvitation(request.body)
        return reply.code(201).send({ id: user.id, displayName: user.displayName })
      },
    )
  }
