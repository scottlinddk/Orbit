import type { FastifyInstance } from 'fastify'
import type { Config } from '../config.ts'
import { OriginNotAllowedError } from '../problem.ts'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Hardening that applies to every response and every state-changing request.
 *
 * CSRF has three layers: the session cookie is SameSite=Strict, bodies must be JSON (browsers
 * cannot send that cross-site without a CORS preflight, and Orbit sends no CORS headers),
 * and this Origin check. Browsers always send Origin on cross-site POST/PUT/PATCH/DELETE.
 * Requests without Origin (curl, scripts) cannot be CSRF, so they pass.
 */
export function registerSecurity(app: FastifyInstance, config: Pick<Config, 'origin'>) {
  app.addHook('onRequest', async (request) => {
    if (SAFE_METHODS.has(request.method)) return
    const origin = request.headers.origin
    if (origin !== undefined && origin !== config.origin) throw new OriginNotAllowedError()
  })

  app.addHook('onSend', async (request, reply) => {
    reply.header('cache-control', 'no-store')
    reply.header('x-content-type-options', 'nosniff')
    reply.header('referrer-policy', 'no-referrer')
    reply.header('content-security-policy', "default-src 'none'; frame-ancestors 'none'")
    reply.header('x-request-id', request.id)
  })
}
