import {
  calendarEventsQuerySchema,
  calendarEventsSchema,
  calendarSourceSchema,
  createCalendarSourceRequestSchema,
  idSchema,
} from '@orbit/contracts'
import { CalendarSourceId, HouseholdId } from '@orbit/domain'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { actorOf } from '../http/session.ts'
import { calendarEventResponse, calendarSourceResponse } from '../mappers.ts'

import { errors, noContent, sessionSecurity } from './schemas.ts'
import type { ProtectedRouteOptions } from './households.ts'

const common = { tags: ['calendar'], security: sessionSecurity } as const
const householdParams = z.object({ householdId: idSchema })

/** A date without a time means midnight UTC, which `Date` already parses that way. */
const parseInstant = (value: string) => new Date(value)

export const calendarRoutes =
  ({ services }: ProtectedRouteOptions): FastifyPluginAsyncZod =>
  async (app) => {
    const { calendar } = services

    app.post(
      '/households/:householdId/calendar/sources',
      {
        schema: {
          ...common,
          summary: 'Add an ICS calendar (owners only)',
          description:
            'Orbit reads the address once to check it, then keeps it encrypted. The address is a secret: no response ever contains it, only its host.',
          params: householdParams,
          body: createCalendarSourceRequestSchema,
          response: {
            201: calendarSourceSchema,
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
        const source = await calendar.addSource(
          actorOf(request),
          HouseholdId(request.params.householdId),
          request.body,
        )
        return reply.code(201).send(calendarSourceResponse(source))
      },
    )

    app.get(
      '/households/:householdId/calendar/sources',
      {
        schema: {
          ...common,
          summary: 'Calendars of a household',
          params: householdParams,
          response: {
            200: z.object({ sources: z.array(calendarSourceSchema) }),
            401: errors[401],
            404: errors[404],
          },
        },
      },
      async (request) => ({
        sources: (
          await calendar.listSources(actorOf(request), HouseholdId(request.params.householdId))
        ).map(calendarSourceResponse),
      }),
    )

    app.delete(
      '/households/:householdId/calendar/sources/:sourceId',
      {
        schema: {
          ...common,
          summary: 'Remove a calendar (owners only)',
          params: householdParams.extend({ sourceId: idSchema }),
          response: {
            204: noContent,
            401: errors[401],
            403: errors[403],
            404: errors[404],
          },
        },
      },
      async (request, reply) => {
        await calendar.removeSource(
          actorOf(request),
          HouseholdId(request.params.householdId),
          CalendarSourceId(request.params.sourceId),
        )
        return reply.code(204).send(null)
      },
    )

    app.get(
      '/households/:householdId/calendar/events',
      {
        schema: {
          ...common,
          summary: 'Events of all calendars in a range',
          description:
            'Merged, oldest first, with recurring events expanded. Available from 7 days ago to 62 days ahead. Each calendar is read at most every five minutes. If a calendar cannot be read, its last good events are still returned and `sources` says which one failed.',
          params: householdParams,
          querystring: calendarEventsQuerySchema,
          response: {
            200: calendarEventsSchema,
            400: errors[400],
            401: errors[401],
            404: errors[404],
            422: errors[422],
          },
        },
      },
      async (request) => {
        const result = await calendar.events(
          actorOf(request),
          HouseholdId(request.params.householdId),
          {
            from: request.query.from === undefined ? undefined : parseInstant(request.query.from),
            to: request.query.to === undefined ? undefined : parseInstant(request.query.to),
          },
        )
        return {
          events: result.events.map(calendarEventResponse),
          sources: [...result.sources],
        }
      },
    )
  }
