import {
  createNotificationEndpointRequestSchema,
  createdNotificationEndpointSchema,
  deliverySchema,
  idSchema,
  notificationEndpointSchema,
  updateNotificationEndpointRequestSchema,
} from '@orbit/contracts'
import { HouseholdId, NotificationEndpointId } from '@orbit/domain'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { actorOf } from '../http/session.ts'
import { deliveryResponse, notificationEndpointResponse } from '../mappers.ts'

import { errors, noContent, sessionSecurity } from './schemas.ts'
import type { ProtectedRouteOptions } from './households.ts'

const common = { tags: ['notifications'], security: sessionSecurity } as const
const householdParams = z.object({ householdId: idSchema })
const endpointParams = householdParams.extend({ endpointId: idSchema })

export const notificationRoutes =
  ({ services }: ProtectedRouteOptions): FastifyPluginAsyncZod =>
  async (app) => {
    const { notifications } = services

    app.post(
      '/households/:householdId/notifications/endpoints',
      {
        schema: {
          ...common,
          summary: 'Add a webhook for notifications (owners only)',
          description:
            'Orbit keeps the address encrypted and returns only its host. The response carries the signing secret once: it signs every delivery in `X-Orbit-Signature`, and Orbit cannot show it again.',
          params: householdParams,
          body: createNotificationEndpointRequestSchema,
          response: {
            201: createdNotificationEndpointSchema,
            400: errors[400],
            401: errors[401],
            403: errors[403],
            404: errors[404],
            409: errors[409],
            422: errors[422],
          },
        },
      },
      async (request, reply) => {
        const created = await notifications.addEndpoint(
          actorOf(request),
          HouseholdId(request.params.householdId),
          request.body,
        )
        return reply.code(201).send({
          ...notificationEndpointResponse(created.endpoint),
          signingSecret: created.signingSecret,
        })
      },
    )

    app.get(
      '/households/:householdId/notifications/endpoints',
      {
        schema: {
          ...common,
          summary: 'Notification webhooks of a household (owners only)',
          params: householdParams,
          response: {
            200: z.object({ endpoints: z.array(notificationEndpointSchema) }),
            401: errors[401],
            403: errors[403],
            404: errors[404],
          },
        },
      },
      async (request) => ({
        endpoints: (
          await notifications.listEndpoints(
            actorOf(request),
            HouseholdId(request.params.householdId),
          )
        ).map(notificationEndpointResponse),
      }),
    )

    app.patch(
      '/households/:householdId/notifications/endpoints/:endpointId',
      {
        schema: {
          ...common,
          summary: 'Change or switch a webhook on or off (owners only)',
          params: endpointParams,
          body: updateNotificationEndpointRequestSchema,
          response: {
            200: notificationEndpointSchema,
            400: errors[400],
            401: errors[401],
            403: errors[403],
            404: errors[404],
            422: errors[422],
          },
        },
      },
      async (request) =>
        notificationEndpointResponse(
          await notifications.updateEndpoint(
            actorOf(request),
            HouseholdId(request.params.householdId),
            NotificationEndpointId(request.params.endpointId),
            request.body,
          ),
        ),
    )

    app.delete(
      '/households/:householdId/notifications/endpoints/:endpointId',
      {
        schema: {
          ...common,
          summary: 'Remove a webhook (owners only)',
          params: endpointParams,
          response: {
            204: noContent,
            401: errors[401],
            403: errors[403],
            404: errors[404],
          },
        },
      },
      async (request, reply) => {
        await notifications.removeEndpoint(
          actorOf(request),
          HouseholdId(request.params.householdId),
          NotificationEndpointId(request.params.endpointId),
        )
        return reply.code(204).send(null)
      },
    )

    app.get(
      '/households/:householdId/notifications/endpoints/:endpointId/deliveries',
      {
        schema: {
          ...common,
          summary: 'The last deliveries of a webhook, newest first (owners only)',
          description:
            'Status codes and short error texts only. Payloads and addresses are not kept.',
          params: endpointParams,
          response: {
            200: z.object({ deliveries: z.array(deliverySchema) }),
            401: errors[401],
            403: errors[403],
            404: errors[404],
          },
        },
      },
      async (request) => ({
        deliveries: (
          await notifications.deliveries(
            actorOf(request),
            HouseholdId(request.params.householdId),
            NotificationEndpointId(request.params.endpointId),
          )
        ).map(deliveryResponse),
      }),
    )

    app.post(
      '/households/:householdId/notifications/endpoints/:endpointId/test',
      {
        schema: {
          ...common,
          summary: 'Send a test notification now (owners only)',
          description:
            'Tried once, even if the endpoint is switched off. A failed test does not count toward switching the endpoint off.',
          params: endpointParams,
          response: {
            200: deliverySchema,
            401: errors[401],
            403: errors[403],
            404: errors[404],
          },
        },
      },
      async (request) =>
        deliveryResponse(
          await notifications.sendTest(
            actorOf(request),
            HouseholdId(request.params.householdId),
            NotificationEndpointId(request.params.endpointId),
          ),
        ),
    )
  }
