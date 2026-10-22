import {
  addListItemRequestSchema,
  createListRequestSchema,
  idSchema,
  listSchema,
  listSummarySchema,
  moveListItemRequestSchema,
  renameListRequestSchema,
  updateListItemRequestSchema,
} from '@orbit/contracts'
import { HouseholdId, ListId, ListItemId } from '@orbit/domain'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { actorOf } from '../http/session.ts'
import { listResponse, listSummaryResponse } from '../mappers.ts'
import { errors, noContent, sessionSecurity } from './schemas.ts'
import type { ProtectedRouteOptions } from './households.ts'

const common = { tags: ['lists'], security: sessionSecurity } as const
const householdParams = z.object({ householdId: idSchema })
const listParams = householdParams.extend({ listId: idSchema })
const itemParams = listParams.extend({ itemId: idSchema })
const readErrors = { 401: errors[401], 404: errors[404] } as const
const writeErrors = {
  400: errors[400],
  401: errors[401],
  403: errors[403],
  404: errors[404],
  422: errors[422],
} as const

/**
 * Household lists. Any member can read and edit: a shared shopping list that only the owner may
 * tick off would be useless at the shop. Edits are last-write-wins per item, and every change
 * answers with the whole list so a client can replace its copy without a second request.
 */
export const listRoutes =
  ({ services }: ProtectedRouteOptions): FastifyPluginAsyncZod =>
  async (app) => {
    const { useCases } = services
    const ids = (p: { householdId: string; listId: string }) =>
      [HouseholdId(p.householdId), ListId(p.listId)] as const

    app.get(
      '/households/:householdId/lists',
      {
        schema: {
          ...common,
          summary: 'Lists of a household with how many items are still open',
          params: householdParams,
          response: { 200: z.object({ lists: z.array(listSummarySchema) }), ...readErrors },
        },
      },
      async (request) => ({
        lists: (
          await useCases.listLists(actorOf(request), HouseholdId(request.params.householdId))
        ).map(listSummaryResponse),
      }),
    )

    app.post(
      '/households/:householdId/lists',
      {
        schema: {
          ...common,
          summary: 'Create a list (any member)',
          params: householdParams,
          body: createListRequestSchema,
          response: { 201: listSchema, ...writeErrors },
        },
      },
      async (request, reply) =>
        reply
          .code(201)
          .send(
            listResponse(
              await useCases.createList(
                actorOf(request),
                HouseholdId(request.params.householdId),
                request.body,
              ),
            ),
          ),
    )

    app.get(
      '/households/:householdId/lists/:listId',
      {
        schema: {
          ...common,
          summary: 'One list with its items in display order',
          params: listParams,
          response: { 200: listSchema, ...readErrors },
        },
      },
      async (request) =>
        listResponse(await useCases.getList(actorOf(request), ...ids(request.params))),
    )

    app.put(
      '/households/:householdId/lists/:listId/name',
      {
        schema: {
          ...common,
          summary: 'Rename a list (any member)',
          params: listParams,
          body: renameListRequestSchema,
          response: { 200: listSchema, ...writeErrors },
        },
      },
      async (request) =>
        listResponse(
          await useCases.renameList(actorOf(request), ...ids(request.params), request.body.name),
        ),
    )

    app.delete(
      '/households/:householdId/lists/:listId',
      {
        schema: {
          ...common,
          summary: 'Delete a list and all its items (any member)',
          params: listParams,
          response: { 204: noContent, ...readErrors, 403: errors[403] },
        },
      },
      async (request, reply) => {
        await useCases.deleteList(actorOf(request), ...ids(request.params))
        return reply.code(204).send(null)
      },
    )

    app.post(
      '/households/:householdId/lists/:listId/items',
      {
        schema: {
          ...common,
          summary: 'Add an item at the end of the list (any member)',
          params: listParams,
          body: addListItemRequestSchema,
          response: { 201: listSchema, ...writeErrors },
        },
      },
      async (request, reply) =>
        reply
          .code(201)
          .send(
            listResponse(
              await useCases.addListItem(actorOf(request), ...ids(request.params), request.body),
            ),
          ),
    )

    app.patch(
      '/households/:householdId/lists/:listId/items/:itemId',
      {
        schema: {
          ...common,
          summary: 'Change an item: its text, quantity or note, or tick it on or off',
          description:
            'Only the fields sent change. Last write wins: there is no version check, so two people editing at once never see a conflict.',
          params: itemParams,
          body: updateListItemRequestSchema,
          response: { 200: listSchema, ...writeErrors },
        },
      },
      async (request) =>
        listResponse(
          await useCases.updateListItem(
            actorOf(request),
            ...ids(request.params),
            ListItemId(request.params.itemId),
            request.body,
          ),
        ),
    )

    app.delete(
      '/households/:householdId/lists/:listId/items/:itemId',
      {
        schema: {
          ...common,
          summary: 'Remove an item (any member)',
          params: itemParams,
          response: { 200: listSchema, ...readErrors, 403: errors[403] },
        },
      },
      async (request) =>
        listResponse(
          await useCases.deleteListItem(
            actorOf(request),
            ...ids(request.params),
            ListItemId(request.params.itemId),
          ),
        ),
    )

    app.put(
      '/households/:householdId/lists/:listId/items/:itemId/position',
      {
        schema: {
          ...common,
          summary: 'Move an item to a position (0 is the top)',
          params: itemParams,
          body: moveListItemRequestSchema,
          response: { 200: listSchema, ...writeErrors },
        },
      },
      async (request) =>
        listResponse(
          await useCases.moveListItem(
            actorOf(request),
            ...ids(request.params),
            ListItemId(request.params.itemId),
            request.body.index,
          ),
        ),
    )

    app.post(
      '/households/:householdId/lists/:listId/clear-completed',
      {
        schema: {
          ...common,
          summary: 'Remove every ticked-off item',
          params: listParams,
          response: { 200: listSchema, ...readErrors, 403: errors[403] },
        },
      },
      async (request) =>
        listResponse(
          await useCases.clearCompletedListItems(actorOf(request), ...ids(request.params)),
        ),
    )
  }
