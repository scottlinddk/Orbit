import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import { NotFoundError } from '@orbit/application'
import Fastify, { type FastifyReply, type FastifyServerOptions } from 'fastify'
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import type { Config } from './config.ts'
import { registerSecurity } from './http/security.ts'
import { createRequireActor } from './http/session.ts'
import { toProblem } from './problem.ts'
import { authRoutes } from './routes/auth.ts'
import { dashboardRoutes } from './routes/dashboards.ts'
import { householdRoutes } from './routes/households.ts'
import type { Services } from './services.ts'

export interface AppOptions {
  services: Services
  config: Config
  logger?: FastifyServerOptions['logger']
  /** Limit for login and registration, per client IP. */
  authRateLimit?: { max: number; timeWindow: string }
  /** Limit for everything else, per client IP. */
  generalRateLimit?: { max: number; timeWindow: string }
}

export const API_PREFIX = '/api/v1'

export async function buildApp(options: AppOptions) {
  const { services, config } = options
  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: config.trustProxy,
    // Bodies are small JSON documents. A low limit bounds memory and parsing work.
    bodyLimit: 64 * 1024,
    // Ids are at most 128 characters. Longer path segments are rejected by the router itself.
    routerOptions: { maxParamLength: 128 },
    // Errors raised by the router, before any route or hook runs (bad URL, oversized segment).
    // Without this they bypass the error handler and echo the URL back.
    frameworkErrors: (error, _request, reply) => {
      const status = (error as { statusCode?: number }).statusCode ?? 400
      // The generic reply type is tied to route schemas, which do not exist at this point.
      const plain = reply as unknown as FastifyReply
      return plain.code(status).type('application/problem+json').send({
        type: 'urn:orbit:problem:bad-request',
        title: 'Bad Request',
        status,
        detail: 'The request URL is not valid',
      })
    },
  }).withTypeProvider<ZodTypeProvider>()

  // JSON only. Fastify also parses text/plain by default, which is what a cross-site HTML form
  // can send. Removing it makes every non-JSON body a 415 before any handler runs.
  app.removeContentTypeParser('text/plain')

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Orbit API',
        version: '0.0.0',
        description:
          'Authentication is a session cookie set by POST /auth/login (named orbit_session, or __Host-orbit_session over HTTPS). Errors use RFC 9457 problem details. A resource in a household you do not belong to is reported as 404, never 403.',
      },
      components: {
        securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'orbit_session' } },
      },
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  })
  await app.register(cookie)
  await app.register(rateLimit, {
    global: true,
    ...(options.generalRateLimit ?? { max: 300, timeWindow: '1 minute' }),
    errorResponseBuilder: () =>
      Object.assign(new Error('Rate limit exceeded'), { statusCode: 429 }),
  })

  registerSecurity(app, config)

  app.setErrorHandler((error, request, reply) => {
    const problem = toProblem(error)
    if (problem.status >= 500) request.log.error({ err: error }, 'unhandled error')
    return reply.code(problem.status).type('application/problem+json').send(problem)
  })
  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).type('application/problem+json').send(toProblem(new NotFoundError())),
  )

  const requireActor = createRequireActor(services.auth, config)
  const authRateLimitOptions = options.authRateLimit ?? { max: 10, timeWindow: '1 minute' }

  await app.register(
    async (api) => {
      await api.register(
        authRoutes({
          services,
          config,
          requireActor: requireActor as never,
          rateLimit: authRateLimitOptions,
        }),
      )
      await api.register(async (protectedScope) => {
        protectedScope.addHook('onRequest', requireActor)
        await protectedScope.register(householdRoutes({ services }))
        await protectedScope.register(dashboardRoutes({ services }))
      })
      api.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger())
    },
    { prefix: API_PREFIX },
  )

  return app
}

export type App = Awaited<ReturnType<typeof buildApp>>
