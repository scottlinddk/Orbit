import {
  addMemberRequestSchema,
  createHouseholdRequestSchema,
  createInvitationRequestSchema,
  createDashboardRequestSchema,
  createdFeedSchema,
  createdInvitationSchema,
  createFeedRequestSchema,
  feedSchema,
  dashboardSchema,
  householdSchema,
  idSchema,
  invitationSchema,
} from '@orbit/contracts'
import { DashboardId, FeedId, HouseholdId, InvitationId, UserId } from '@orbit/domain'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { actorOf } from '../http/session.ts'
import {
  dashboardResponse,
  feedResponse,
  householdResponse,
  invitationResponse,
} from '../mappers.ts'
import type { Services } from '../services.ts'
import { errors, noContent, sessionSecurity } from './schemas.ts'

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

    app.post(
      '/households/:householdId/invitations',
      {
        schema: {
          ...common,
          tags: ['invitations'],
          summary: 'Invite someone to the household (owners only)',
          description:
            'Returns the secret token once. Share it as a link; Orbit keeps only a hash and cannot show it again. The invitee chooses their own username and password.',
          params: householdParams,
          body: createInvitationRequestSchema,
          response: {
            201: createdInvitationSchema,
            400: errors[400],
            401: errors[401],
            403: errors[403],
            404: errors[404],
            422: errors[422],
          },
        },
      },
      async (request, reply) => {
        const { invitation, token } = await useCases.createInvitation(
          actorOf(request),
          HouseholdId(request.params.householdId),
          request.body,
        )
        return reply.code(201).send({ ...invitationResponse(invitation), token })
      },
    )

    app.get(
      '/households/:householdId/invitations',
      {
        schema: {
          ...common,
          tags: ['invitations'],
          summary: 'Invitations that can still be used (owners only)',
          params: householdParams,
          response: {
            200: z.object({ invitations: z.array(invitationSchema) }),
            401: errors[401],
            403: errors[403],
            404: errors[404],
          },
        },
      },
      async (request) => ({
        invitations: (
          await useCases.listInvitations(actorOf(request), HouseholdId(request.params.householdId))
        ).map(invitationResponse),
      }),
    )

    app.delete(
      '/households/:householdId/invitations/:invitationId',
      {
        schema: {
          ...common,
          tags: ['invitations'],
          summary: 'Revoke an invitation (owners only)',
          params: householdParams.extend({ invitationId: idSchema }),
          response: {
            204: noContent,
            401: errors[401],
            403: errors[403],
            404: errors[404],
            422: errors[422],
          },
        },
      },
      async (request, reply) => {
        await useCases.revokeInvitation(
          actorOf(request),
          HouseholdId(request.params.householdId),
          InvitationId(request.params.invitationId),
        )
        return reply.code(204).send(null)
      },
    )

    app.post(
      '/households/:householdId/feeds',
      {
        schema: {
          ...common,
          tags: ['feeds'],
          summary: 'Create a read-only display feed (owners only)',
          description:
            'Returns the secret token once. The display sends it as `Authorization: Bearer <token>` to GET /feed. Orbit keeps only a hash and cannot show it again. The feed publishes exactly the chosen fields.',
          params: householdParams,
          body: createFeedRequestSchema,
          response: {
            201: createdFeedSchema,
            400: errors[400],
            401: errors[401],
            403: errors[403],
            404: errors[404],
            422: errors[422],
          },
        },
      },
      async (request, reply) => {
        const { dashboardId, ...rest } = request.body
        const { feed, token } = await useCases.createFeed(
          actorOf(request),
          HouseholdId(request.params.householdId),
          {
            ...rest,
            dashboardId: dashboardId === undefined ? undefined : DashboardId(dashboardId),
          },
        )
        return reply.code(201).send({ ...feedResponse(feed), token })
      },
    )

    app.get(
      '/households/:householdId/feeds',
      {
        schema: {
          ...common,
          tags: ['feeds'],
          summary: 'Feeds that can still be read (owners only)',
          params: householdParams,
          response: {
            200: z.object({ feeds: z.array(feedSchema) }),
            401: errors[401],
            403: errors[403],
            404: errors[404],
          },
        },
      },
      async (request) => ({
        feeds: (
          await useCases.listFeeds(actorOf(request), HouseholdId(request.params.householdId))
        ).map(feedResponse),
      }),
    )

    app.delete(
      '/households/:householdId/feeds/:feedId',
      {
        schema: {
          ...common,
          tags: ['feeds'],
          summary: 'Revoke a feed (owners only). Its token stops working at once.',
          params: householdParams.extend({ feedId: idSchema }),
          response: {
            204: noContent,
            401: errors[401],
            403: errors[403],
            404: errors[404],
            422: errors[422],
          },
        },
      },
      async (request, reply) => {
        await useCases.revokeFeed(
          actorOf(request),
          HouseholdId(request.params.householdId),
          FeedId(request.params.feedId),
        )
        return reply.code(204).send(null)
      },
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
