import {
  addWidgetRequestSchema,
  configureWidgetRequestSchema,
  dashboardSchema,
  idSchema,
  moveWidgetRequestSchema,
  renameDashboardRequestSchema,
  resizeWidgetRequestSchema,
  setColumnsRequestSchema,
} from '@orbit/contracts'
import { DashboardId, WidgetPlacementId, type JsonObject } from '@orbit/domain'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { actorOf } from '../http/session.ts'
import { dashboardResponse } from '../mappers.ts'
import { errors, noContent, sessionSecurity } from './schemas.ts'
import type { ProtectedRouteOptions } from './households.ts'

const common = { tags: ['dashboards'], security: sessionSecurity } as const
const dashboardParams = z.object({ dashboardId: idSchema })
const widgetParams = dashboardParams.extend({ widgetId: idSchema })
const mutationErrors = {
  400: errors[400],
  401: errors[401],
  403: errors[403],
  404: errors[404],
  422: errors[422],
} as const

export const dashboardRoutes =
  ({ services }: ProtectedRouteOptions): FastifyPluginAsyncZod =>
  async (app) => {
    const { useCases } = services

    app.get(
      '/dashboards/:dashboardId',
      {
        schema: {
          ...common,
          summary: 'One dashboard with its widgets in display order',
          params: dashboardParams,
          response: { 200: dashboardSchema, 401: errors[401], 404: errors[404] },
        },
      },
      async (request) =>
        dashboardResponse(
          await useCases.getDashboard(actorOf(request), DashboardId(request.params.dashboardId)),
        ),
    )

    app.put(
      '/dashboards/:dashboardId/name',
      {
        schema: {
          ...common,
          summary: 'Rename a dashboard (owners only)',
          params: dashboardParams,
          body: renameDashboardRequestSchema,
          response: { 200: dashboardSchema, ...mutationErrors },
        },
      },
      async (request) =>
        dashboardResponse(
          await useCases.renameDashboard(
            actorOf(request),
            DashboardId(request.params.dashboardId),
            request.body.name,
          ),
        ),
    )

    app.put(
      '/dashboards/:dashboardId/columns',
      {
        schema: {
          ...common,
          summary: 'Set the number of columns. Wider widgets shrink to fit.',
          params: dashboardParams,
          body: setColumnsRequestSchema,
          response: { 200: dashboardSchema, ...mutationErrors },
        },
      },
      async (request) =>
        dashboardResponse(
          await useCases.setDashboardColumns(
            actorOf(request),
            DashboardId(request.params.dashboardId),
            request.body.columns,
          ),
        ),
    )

    app.delete(
      '/dashboards/:dashboardId',
      {
        schema: {
          ...common,
          summary: 'Delete a dashboard (owners only)',
          params: dashboardParams,
          response: { 204: noContent, 401: errors[401], 403: errors[403], 404: errors[404] },
        },
      },
      async (request, reply) => {
        await useCases.deleteDashboard(actorOf(request), DashboardId(request.params.dashboardId))
        return reply.code(204).send(null)
      },
    )

    app.post(
      '/dashboards/:dashboardId/widgets',
      {
        schema: {
          ...common,
          summary: 'Add a widget, by default at the end',
          params: dashboardParams,
          body: addWidgetRequestSchema,
          response: { 201: dashboardSchema, ...mutationErrors },
        },
      },
      async (request, reply) => {
        const { config, ...rest } = request.body
        // widgetConfigSchema has already checked that this is plain, bounded JSON.
        const dashboard = await useCases.addWidget(
          actorOf(request),
          DashboardId(request.params.dashboardId),
          { ...rest, ...(config === undefined ? {} : { config: config as JsonObject }) },
        )
        return reply.code(201).send(dashboardResponse(dashboard))
      },
    )

    app.delete(
      '/dashboards/:dashboardId/widgets/:widgetId',
      {
        schema: {
          ...common,
          summary: 'Remove a widget',
          params: widgetParams,
          response: { 200: dashboardSchema, ...mutationErrors },
        },
      },
      async (request) =>
        dashboardResponse(
          await useCases.removeWidget(
            actorOf(request),
            DashboardId(request.params.dashboardId),
            WidgetPlacementId(request.params.widgetId),
          ),
        ),
    )

    app.put(
      '/dashboards/:dashboardId/widgets/:widgetId/position',
      {
        schema: {
          ...common,
          summary: 'Move a widget so it ends up at the given index',
          params: widgetParams,
          body: moveWidgetRequestSchema,
          response: { 200: dashboardSchema, ...mutationErrors },
        },
      },
      async (request) =>
        dashboardResponse(
          await useCases.moveWidget(
            actorOf(request),
            DashboardId(request.params.dashboardId),
            WidgetPlacementId(request.params.widgetId),
            request.body.toIndex,
          ),
        ),
    )

    app.put(
      '/dashboards/:dashboardId/widgets/:widgetId/span',
      {
        schema: {
          ...common,
          summary: 'Set how many columns a widget occupies',
          params: widgetParams,
          body: resizeWidgetRequestSchema,
          response: { 200: dashboardSchema, ...mutationErrors },
        },
      },
      async (request) =>
        dashboardResponse(
          await useCases.resizeWidget(
            actorOf(request),
            DashboardId(request.params.dashboardId),
            WidgetPlacementId(request.params.widgetId),
            request.body.span,
          ),
        ),
    )

    app.put(
      '/dashboards/:dashboardId/widgets/:widgetId/config',
      {
        schema: {
          ...common,
          summary: "Replace a widget's settings",
          params: widgetParams,
          body: configureWidgetRequestSchema,
          response: { 200: dashboardSchema, ...mutationErrors },
        },
      },
      async (request) =>
        dashboardResponse(
          await useCases.configureWidget(
            actorOf(request),
            DashboardId(request.params.dashboardId),
            WidgetPlacementId(request.params.widgetId),
            // widgetConfigSchema has already checked that this is plain, bounded JSON.
            request.body.config as JsonObject,
          ),
        ),
    )
  }
