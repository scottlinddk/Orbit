import { z } from 'zod'
import { widgetConfigSchema } from './common.ts'

export const columnsSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])

export const widgetSchema = z.object({
  id: z.string(),
  type: z.string(),
  span: z.number().int(),
  config: z.record(z.string(), z.unknown()),
})

export const dashboardSchema = z
  .object({
    id: z.string(),
    householdId: z.string(),
    name: z.string(),
    columns: columnsSchema,
    widgets: z.array(widgetSchema),
  })
  .meta({ id: 'Dashboard' })
export type DashboardResponse = z.infer<typeof dashboardSchema>

export const createDashboardRequestSchema = z.strictObject({
  name: z.string().min(1).max(80),
  columns: columnsSchema.optional(),
})

export const renameDashboardRequestSchema = z.strictObject({ name: z.string().min(1).max(80) })

export const setColumnsRequestSchema = z.strictObject({ columns: columnsSchema })

export const addWidgetRequestSchema = z.strictObject({
  type: z.string().min(3).max(64),
  span: z.number().int().min(1).max(4).optional(),
  config: widgetConfigSchema.optional(),
  index: z.number().int().min(0).max(50).optional(),
})

export const moveWidgetRequestSchema = z.strictObject({ toIndex: z.number().int().min(0).max(49) })
