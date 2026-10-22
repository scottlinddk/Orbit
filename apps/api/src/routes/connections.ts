import {
  connectionSchema,
  connectionTestSchema,
  createConnectionRequestSchema,
  discoveredEntitySchema,
  idSchema,
  setMirrorsRequestSchema,
} from '@orbit/contracts'
import { ConnectionId, HouseholdId } from '@orbit/domain'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { actorOf } from '../http/session.ts'
import { connectionResponse } from '../mappers.ts'
import { errors, noContent, sessionSecurity } from './schemas.ts'
import type { ProtectedRouteOptions } from './households.ts'

const common = { tags: ['connections'], security: sessionSecurity } as const
const householdParams = z.object({ householdId: idSchema })
const connectionParams = householdParams.extend({ connectionId: idSchema })

/**
 * Connections to other systems, for owners. The address and access token of the other system are
 * secrets: they are accepted here, stored encrypted, and never returned by any route. What a
 * connection mirrors reaches everyone else through the calendar and list routes.
 */
export const connectionRoutes =
  ({ services }: ProtectedRouteOptions): FastifyPluginAsyncZod =>
  async (app) => {
    const { connections } = services
    const ids = (p: { householdId: string; connectionId: string }) =>
      [HouseholdId(p.householdId), ConnectionId(p.connectionId)] as const

    app.post(
      '/households/:householdId/connections',
      {
        schema: {
          ...common,
          summary: 'Connect another system, such as Home Assistant (owners only)',
          description:
            'Orbit calls the other system once to check the address and token, then keeps both encrypted. Neither is ever returned, only the host. Reaching a system on a private network needs the operator to list its host in ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS.',
          params: householdParams,
          body: createConnectionRequestSchema,
          response: {
            201: connectionSchema,
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
        const connection = await connections.addConnection(
          actorOf(request),
          HouseholdId(request.params.householdId),
          request.body,
        )
        return reply.code(201).send(connectionResponse(connection))
      },
    )

    app.get(
      '/households/:householdId/connections',
      {
        schema: {
          ...common,
          summary: 'Connections of a household (owners only)',
          params: householdParams,
          response: {
            200: z.object({ connections: z.array(connectionSchema) }),
            401: errors[401],
            403: errors[403],
            404: errors[404],
          },
        },
      },
      async (request) => ({
        connections: (
          await connections.listConnections(
            actorOf(request),
            HouseholdId(request.params.householdId),
          )
        ).map(connectionResponse),
      }),
    )

    app.delete(
      '/households/:householdId/connections/:connectionId',
      {
        schema: {
          ...common,
          summary: 'Remove a connection and forget its token (owners only)',
          params: connectionParams,
          response: {
            204: noContent,
            401: errors[401],
            403: errors[403],
            404: errors[404],
          },
        },
      },
      async (request, reply) => {
        await connections.removeConnection(actorOf(request), ...ids(request.params))
        return reply.code(204).send(null)
      },
    )

    app.post(
      '/households/:householdId/connections/:connectionId/test',
      {
        schema: {
          ...common,
          summary: 'Check that the other system still answers (owners only)',
          description: 'Always answers 200. `ok` says whether the check worked.',
          params: connectionParams,
          response: {
            200: connectionTestSchema,
            401: errors[401],
            403: errors[403],
            404: errors[404],
          },
        },
      },
      async (request) => connections.test(actorOf(request), ...ids(request.params)),
    )

    app.get(
      '/households/:householdId/connections/:connectionId/entities',
      {
        schema: {
          ...common,
          summary: 'Calendars and lists in the other system, and which are shown (owners only)',
          params: connectionParams,
          response: {
            200: z.object({ entities: z.array(discoveredEntitySchema) }),
            401: errors[401],
            403: errors[403],
            404: errors[404],
            422: errors[422],
          },
        },
      },
      async (request) => ({
        entities: await connections.discover(actorOf(request), ...ids(request.params)),
      }),
    )

    app.put(
      '/households/:householdId/connections/:connectionId/mirrors',
      {
        schema: {
          ...common,
          summary: 'Choose which calendars and lists are shown (owners only)',
          description:
            'Replaces the whole set. Calendars join the calendar events and lists join the household lists. Both are read only in Orbit.',
          params: connectionParams,
          body: setMirrorsRequestSchema,
          response: {
            200: connectionSchema,
            400: errors[400],
            401: errors[401],
            403: errors[403],
            404: errors[404],
            422: errors[422],
          },
        },
      },
      async (request) =>
        connectionResponse(
          await connections.setMirrors(
            actorOf(request),
            ...ids(request.params),
            request.body.entityIds,
          ),
        ),
    )
  }
