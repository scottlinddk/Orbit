import type { FastifyInstance } from 'fastify'
import type { Config } from '../config.ts'
import { OriginNotAllowedError } from '../problem.ts'
import { API_CSP, WEB_CSP, isFingerprinted } from './web.ts'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Hardening that applies to every response and every state-changing request.
 *
 * CSRF has three layers: the session cookie is SameSite=Strict, bodies must be JSON (browsers
 * cannot send that cross-site without a CORS preflight, and Orbit sends no CORS headers),
 * and this Origin check. Browsers always send Origin on cross-site POST/PUT/PATCH/DELETE.
 * Requests without Origin (curl, scripts) cannot be CSRF, so they pass.
 */
export function registerSecurity(
  app: FastifyInstance,
  config: Pick<Config, 'origin'>,
  options: { apiPrefix: string; servesWebApp: boolean },
) {
  app.addHook('onRequest', async (request) => {
    if (SAFE_METHODS.has(request.method)) return
    const origin = request.headers.origin
    if (origin !== undefined && origin !== config.origin) throw new OriginNotAllowedError()
  })

  app.addHook('onSend', async (request, reply) => {
    const isApi = request.url.startsWith(options.apiPrefix)
    reply.header('x-content-type-options', 'nosniff')
    reply.header('referrer-policy', 'no-referrer')
    reply.header('x-request-id', request.id)
    if (isApi || !options.servesWebApp) {
      reply.header('cache-control', 'no-store')
      reply.header('content-security-policy', API_CSP)
      return
    }
    reply.header('content-security-policy', WEB_CSP)
    // Fingerprinted assets never change. The HTML shell must be re-checked, or a deploy would
    // leave people on an old page that points at deleted files.
    reply.header(
      'cache-control',
      isFingerprinted(request.url) ? 'public, max-age=31536000, immutable' : 'no-cache',
    )
  })
}
