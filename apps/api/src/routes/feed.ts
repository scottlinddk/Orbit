import { createHash } from 'node:crypto'
import { NotFoundError } from '@orbit/application'
import { feedContentSchema } from '@orbit/contracts'
import type { FastifyReply } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { WindowCounter, type FeedRateLimitOptions } from '../http/feed-rate-limit.ts'
import type { Services } from '../services.ts'
import { errors, noContent } from './schemas.ts'

export interface FeedRouteOptions {
  services: Services
  rateLimit: FeedRateLimitOptions
}

const BEARER = /^Bearer ([A-Za-z0-9._~+/=-]{1,256})$/

/**
 * The display feed. It is public in the sense that it needs no session, and protected by the
 * feed token alone. Every way the token can be wrong answers with the same 404.
 */
export const feedRoutes =
  ({ services, rateLimit }: FeedRouteOptions): FastifyPluginAsyncZod =>
  async (app) => {
    const byToken = new WindowCounter(rateLimit.windowMs, rateLimit.now)
    const byClient = new WindowCounter(rateLimit.windowMs, rateLimit.now)
    const failuresByClient = new WindowCounter(rateLimit.windowMs, rateLimit.now)

    app.get(
      '/feed',
      {
        // The general limit is per client and generous. This route has its own, tighter ones.
        config: { rateLimit: false },
        schema: {
          tags: ['feeds'],
          summary: 'Read a display feed',
          description:
            'Send the feed token as `Authorization: Bearer <token>`. Missing, malformed, unknown and revoked tokens all answer the same 404. The body is at most 64 KB and carries an ETag; send it back as If-None-Match to get a 304.',
          response: {
            200: feedContentSchema,
            304: noContent,
            404: errors[404],
            413: errors[413],
            429: errors[429],
          },
        },
      },
      async (request, reply) => {
        const client = request.ip
        if (
          byClient.hit(client) > rateLimit.perClient ||
          failuresByClient.count(client) >= rateLimit.failuresPerClient
        )
          throw rateLimited()

        const token = BEARER.exec(request.headers.authorization ?? '')?.[1]
        if (token === undefined) {
          failuresByClient.hit(client)
          throw new NotFoundError()
        }
        // Keyed by a hash, so the counter never holds a usable token.
        const key = createHash('sha256').update(token).digest('hex')
        if (byToken.hit(key) > rateLimit.perToken) throw rateLimited()

        let content
        try {
          content = await services.feedReader.read(token)
        } catch (error) {
          if (error instanceof NotFoundError) failuresByClient.hit(client)
          throw error
        }

        const body = JSON.stringify(content)
        const etag = `"${createHash('sha256').update(body).digest('base64url')}"`
        reply.header('etag', etag)
        reply.header('cache-control', 'private, no-cache')
        if (request.headers['if-none-match'] === etag) {
          // The typed reply insists on a payload, but a 304 must carry none.
          return (reply as unknown as FastifyReply).code(304).send()
        }
        return content
      },
    )
  }

function rateLimited() {
  return Object.assign(new Error('Rate limit exceeded'), { statusCode: 429 })
}
