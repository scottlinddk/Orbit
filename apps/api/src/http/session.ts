import type { Auth } from '@orbit/application'
import type { Actor } from '@orbit/application'
import type { FastifyRequest } from 'fastify'
import type { Config } from '../config.ts'
import { UnauthenticatedError } from '../problem.ts'

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by requireActor on protected routes. */
    actor?: Actor
  }
}

/**
 * The __Host- prefix makes browsers reject the cookie unless it is Secure, has Path=/ and
 * no Domain, which blocks a sibling subdomain from planting one. It needs HTTPS, so plain
 * http://localhost development uses an unprefixed name.
 */
export const cookieName = (config: Pick<Config, 'secureCookies'>) =>
  config.secureCookies ? '__Host-orbit_session' : 'orbit_session'

export function cookieOptions(config: Pick<Config, 'secureCookies'>) {
  return {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'strict' as const,
    path: '/',
  }
}

export function createRequireActor(auth: Auth, config: Pick<Config, 'secureCookies'>) {
  const name = cookieName(config)
  return async function requireActor(request: FastifyRequest) {
    const token = request.cookies[name]
    const actor = token ? await auth.authenticate(token) : undefined
    if (!actor) throw new UnauthenticatedError()
    request.actor = actor
  }
}

/** The actor set by requireActor. Throws if a route forgot to require authentication. */
export function actorOf(request: FastifyRequest): Actor {
  if (!request.actor) throw new UnauthenticatedError()
  return request.actor
}
