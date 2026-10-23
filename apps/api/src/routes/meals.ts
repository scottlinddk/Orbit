import {
  idSchema,
  mealPlanQuerySchema,
  mealPlanSchema,
  mealRecipeSchema,
  stockSchema,
} from '@orbit/contracts'
import { ConnectionId, HouseholdId } from '@orbit/domain'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { actorOf } from '../http/session.ts'
import { errors, sessionSecurity } from './schemas.ts'
import type { ProtectedRouteOptions } from './households.ts'

const common = { tags: ['kitchen'], security: sessionSecurity } as const
const householdParams = z.object({ householdId: idSchema })

/**
 * The meal plan, its recipes and the stock, as mirrored from Mealie and Grocy (ADR 0021). They
 * are read only and carry nothing about the connection: no address, no token, no image link.
 */
export const mealRoutes =
  ({ services }: ProtectedRouteOptions): FastifyPluginAsyncZod =>
  async (app) => {
    const { connections } = services

    app.get(
      '/households/:householdId/meals',
      {
        schema: {
          ...common,
          summary: 'Planned meals in a range of dates',
          description:
            'Entries of every connected Mealie meal plan, oldest first. A range is at most 31 days. Each plan is read at most every five minutes. If one cannot be read, its last good entries are still returned and `sources` says which one failed.',
          params: householdParams,
          querystring: mealPlanQuerySchema,
          response: {
            200: mealPlanSchema,
            400: errors[400],
            401: errors[401],
            403: errors[403],
            404: errors[404],
            422: errors[422],
          },
        },
      },
      async (request) => {
        const result = await connections.mealPlan(
          actorOf(request),
          HouseholdId(request.params.householdId),
          request.query,
        )
        return {
          entries: result.entries.map((e) => ({
            id: e.id,
            date: e.date,
            type: e.type,
            title: e.title,
            ...(e.note === undefined ? {} : { note: e.note }),
            ...(e.recipe === undefined
              ? {}
              : {
                  recipe: {
                    connectionId: e.connectionId,
                    ref: e.recipe.ref,
                    name: e.recipe.name,
                  },
                }),
          })),
          sources: [...result.sources],
        }
      },
    )

    app.get(
      '/households/:householdId/meals/recipes/:connectionId/:ref',
      {
        schema: {
          ...common,
          summary: 'A recipe that a planned meal points to',
          description:
            'Only recipes that appear in the meal plan can be read, not the whole recipe library behind it. Images are left out on purpose.',
          params: householdParams.extend({
            connectionId: idSchema,
            ref: z.string().min(1).max(200),
          }),
          response: {
            200: mealRecipeSchema,
            401: errors[401],
            403: errors[403],
            404: errors[404],
            422: errors[422],
          },
        },
      },
      async (request) => {
        const recipe = await connections.recipe(
          actorOf(request),
          HouseholdId(request.params.householdId),
          ConnectionId(request.params.connectionId),
          request.params.ref,
        )
        return {
          name: recipe.name,
          ...(recipe.description === undefined ? {} : { description: recipe.description }),
          ...(recipe.servings === undefined ? {} : { servings: recipe.servings }),
          ingredients: [...recipe.ingredients],
          instructions: [...recipe.instructions],
        }
      },
    )

    app.get(
      '/households/:householdId/stock',
      {
        schema: {
          ...common,
          summary: 'Stock that is expired, due soon or running out',
          description:
            'From every connected Grocy stock overview, most urgent first. Each is read at most every five minutes. If one cannot be read, its last good items are still returned and `sources` says which one failed.',
          params: householdParams,
          response: {
            200: stockSchema,
            401: errors[401],
            403: errors[403],
            404: errors[404],
          },
        },
      },
      async (request) => {
        const result = await connections.stock(
          actorOf(request),
          HouseholdId(request.params.householdId),
        )
        return {
          items: result.items.map((i) => ({
            id: i.id,
            name: i.name,
            status: i.status,
            amount: i.amount,
            ...(i.bestBefore === undefined ? {} : { bestBefore: i.bestBefore }),
          })),
          sources: [...result.sources],
        }
      },
    )
  }
