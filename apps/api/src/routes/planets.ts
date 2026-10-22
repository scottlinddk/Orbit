import { idSchema, planetRenderSchema, planetWidgetSchema } from '@orbit/contracts'
import { NotFoundError } from '@orbit/application'
import { DashboardId } from '@orbit/domain'
import { planetIdOfWidgetType, WebhookRejectedError } from '@orbit/module-planets/server'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { actorOf } from '../http/session.ts'
import type { Services } from '../services.ts'
import { errors, sessionSecurity } from './schemas.ts'

const common = { tags: ['planets'], security: sessionSecurity } as const

/** Never larger than the biggest `max_bytes` a webhook source can declare (1 MiB), plus slack. */
const WEBHOOK_BODY_LIMIT = 1_048_576 + 1024

export const planetRoutes =
  ({ services }: { services: Services }): FastifyPluginAsyncZod =>
  async (app) => {
    const { planets, useCases } = services

    app.get(
      '/planets/widgets',
      {
        schema: {
          ...common,
          summary: 'Widgets added by installed Planets',
          description:
            'One entry per installed Planet, in the shape of a built-in widget definition: a type, a title and a form.',
          response: { 200: z.object({ widgets: z.array(planetWidgetSchema) }), 401: errors[401] },
        },
      },
      async () => ({
        // Copies, because the response type is mutable and the widget options are read-only.
        widgets: (planets?.widgets() ?? []).map((widget) => ({
          ...widget,
          options: widget.options.map((o) =>
            o.kind === 'select' ? { ...o, choices: o.choices.map((c) => ({ ...c })) } : { ...o },
          ),
        })),
      }),
    )

    app.get(
      '/dashboards/:dashboardId/widgets/:widgetId/planet',
      {
        schema: {
          ...common,
          summary: 'The rendered output of a Planet widget',
          description:
            'Access is decided by the dashboard: a dashboard of a household you do not belong to answers 404. The output is served from the last good data and never waits for the Planet’s data source, except the first time.',
          params: z.object({ dashboardId: idSchema, widgetId: idSchema }),
          response: { 200: planetRenderSchema, 401: errors[401], 404: errors[404] },
        },
      },
      async (request) => {
        const dashboard = await useCases.getDashboard(
          actorOf(request),
          DashboardId(request.params.dashboardId),
        )
        const placement = dashboard.widgets.find((w) => w.id === request.params.widgetId)
        const planetId = placement && planetIdOfWidgetType(placement.type)
        if (!planets || !placement || !planetId) throw new NotFoundError()
        const rendered = await planets.render(planetId, placement.id, placement.config)
        return {
          html: rendered.html,
          stale: rendered.stale,
          ...(rendered.updatedAt === undefined ? {} : { updatedAt: rendered.updatedAt }),
          ...(rendered.error === undefined ? {} : { error: rendered.error }),
        }
      },
    )
  }

/**
 * The only unauthenticated Planet route: a webhook delivery. The secret is in the URL path,
 * unguessable, kept only as a hash, and replaceable. An unknown token and a Planet that was
 * removed answer the same 404.
 */
export const planetWebhookRoutes =
  ({ services }: { services: Services }): FastifyPluginAsyncZod =>
  async (app) => {
    // The signature covers the raw bytes, so the body is kept as text here.
    app.removeContentTypeParser('application/json')
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) =>
      done(null, body),
    )

    app.post(
      '/planet-hooks/:token',
      {
        bodyLimit: WEBHOOK_BODY_LIMIT,
        schema: {
          tags: ['planets'],
          summary: 'Deliver data to a Planet webhook source',
          description:
            'Public on purpose: the unguessable token in the path is the credential. Sources that declare an HMAC secret also need `x-orbit-signature: sha256=<hex>` over the raw body.',
          params: z.object({ token: z.string().min(16).max(128) }),
          response: {
            204: z.null().describe('Stored'),
            400: errors[400],
            401: errors[401],
            404: errors[404],
            413: errors[400],
            429: errors[429],
          },
        },
      },
      async (request, reply) => {
        if (!services.planets) throw new NotFoundError()
        const signature = request.headers['x-orbit-signature']
        await services.planets.receiveWebhook({
          token: request.params.token,
          body: typeof request.body === 'string' ? request.body : '',
          signature: typeof signature === 'string' ? signature : undefined,
        })
        return reply.code(204).send(null)
      },
    )
  }

export { WebhookRejectedError }
