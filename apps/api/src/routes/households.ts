import {
  addMemberRequestSchema,
  createHouseholdRequestSchema,
  createDashboardRequestSchema,
  dashboardSchema,
  householdSchema,
  idSchema,
} from '@orbit/contracts'
import { HouseholdId, UserId } from '@orbit/domain'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { actorOf } from '../http/session.ts'
import { dashboardResponse, householdResponse } from '../mappers.ts'
import type { Services } from '../services.ts'
import { errors, sessionSecurity } from './schemas.ts'

export interface ProtectedRouteOptions {
  services: Services
}

const common = { tags: ['households'], security: sessionSecurity } as const
const householdParams = z.object({ householdId: idSchema })

export const householdRoutes =
  ({ services }: ProtectedRouteOptions): FastifyPluginAsyncZod =>
  async (app) => {
    const { useCases } = services

    app.get(
      '/households',
      {
        schema: {
          ...common,
          summary: 'Households you belong to',
          response: { 200: z.object({ households: z.array(householdSchema) }), 401: errors[401] },
        },
      },
      async (request) => ({
        households: (await useCases.listHouseholds(actorOf(request))).map(householdResponse),
      }),
    )

    app.post(
      '/households',
      {
        schema: {
          ...common,
          summary: 'Create a household you own',
          body: createHouseholdRequestSchema,
          response: { 201: householdSchema, 400: errors[400], 401: errors[401], 422: errors[422] },
        },
      },
      async (request, reply) => {
        const household = await useCases.createHousehold(actorOf(request), request.body)
        return reply.code(201).send(householdResponse(household))
      },
    )

    app.get(
      '/households/:householdId',
      {
        schema: {
          ...common,
          summary: 'One household',
          params: householdParams,
          response: { 200: householdSchema, 401: errors[401], 404: errors[404] },
        },
      },
      async (request) =>
        householdResponse(
          await useCases.getHousehold(actorOf(request), HouseholdId(request.params.householdId)),
        ),
    )

    app.post(
      '/households/:householdId/members',
      {
        schema: {
          ...common,
          summary: 'Add an existing account to the household (owners only)',
          params: householdParams,
          body: addMemberRequestSchema,
          response: {
            200: householdSchema,
            400: errors[400],
            401: errors[401],
            403: errors[403],
            404: errors[404],
            422: errors[422],
          },
        },
      },
      async (request) =>
        householdResponse(
          await useCases.addHouseholdMemberByUsername(
            actorOf(request),
            HouseholdId(request.params.householdId),
            request.body,
          ),
        ),
    )

    app.delete(
      '/households/:householdId/members/:userId',
      {
        schema: {
          ...common,
          summary: 'Remove a member (owners only). A household always keeps one owner.',
          params: householdParams.extend({ userId: idSchema }),
          response: {
            200: householdSchema,
            401: errors[401],
            403: errors[403],
            404: errors[404],
            422: errors[422],
          },
        },
      },
      async (request) =>
        householdResponse(
          await useCases.removeHouseholdMember(
            actorOf(request),
            HouseholdId(request.params.householdId),
            UserId(request.params.userId),
          ),
        ),
    )

    app.get(
      '/households/:householdId/dashboards',
      {
        schema: {
          ...common,
          tags: ['dashboards'],
          summary: 'Dashboards of a household',
          params: householdParams,
          response: {
            200: z.object({ dashboards: z.array(dashboardSchema) }),
            401: errors[401],
            404: errors[404],
          },
        },
      },
      async (request) => ({
        dashboards: (
          await useCases.listDashboards(actorOf(request), HouseholdId(request.params.householdId))
        ).map(dashboardResponse),
      }),
    )

    app.post(
      '/households/:householdId/dashboards',
      {
        schema: {
          ...common,
          tags: ['dashboards'],
          summary: 'Create a dashboard (owners only)',
          params: householdParams,
          body: createDashboardRequestSchema,
          response: {
            201: dashboardSchema,
            400: errors[400],
            401: errors[401],
            403: errors[403],
            404: errors[404],
            422: errors[422],
          },
        },
      },
      async (request, reply) => {
        const dashboard = await useCases.createDashboard(
          actorOf(request),
          HouseholdId(request.params.householdId),
          request.body,
        )
        return reply.code(201).send(dashboardResponse(dashboard))
      },
    )
  }
