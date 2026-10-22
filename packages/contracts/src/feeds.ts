import { z } from 'zod'

/** Mirrors FEED_FIELDS in the domain. A contract test keeps the two lists equal. */
export const feedFieldSchema = z.enum([
  'household.name',
  'dashboard.name',
  'dashboard.widgets',
  'list.name',
  'list.items',
])

export const createFeedRequestSchema = z.strictObject({
  name: z.string().min(1).max(80),
  /** The allowlist. The feed publishes these fields and nothing else. */
  fields: z.array(feedFieldSchema).min(1).max(feedFieldSchema.options.length),
  /** Required when a `dashboard.*` field is chosen. */
  dashboardId: z.string().min(1).max(128).optional(),
  /** Required when a `list.*` field is chosen. */
  listId: z.string().min(1).max(128).optional(),
})

export const feedSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    fields: z.array(feedFieldSchema),
    dashboardId: z.string().optional(),
    listId: z.string().optional(),
    createdAt: z.string(),
  })
  .meta({ id: 'Feed' })
export type FeedResponse = z.infer<typeof feedSchema>

/** The only response that carries the secret. It is not stored and cannot be shown again. */
export const createdFeedSchema = feedSchema
  .extend({ token: z.string() })
  .meta({ id: 'CreatedFeed' })
export type CreatedFeedResponse = z.infer<typeof createdFeedSchema>

/** What a display reads. Only the fields the owner chose are present. */
export const feedContentSchema = z
  .object({
    household: z.object({ name: z.string() }).optional(),
    dashboard: z
      .object({
        name: z.string().optional(),
        widgets: z.array(z.object({ type: z.string(), span: z.number() })).optional(),
      })
      .nullable()
      .optional(),
    /** Open items only, in the order on the list, at most 50. */
    list: z
      .object({
        name: z.string().optional(),
        items: z.array(z.object({ text: z.string(), quantity: z.string().optional() })).optional(),
      })
      .nullable()
      .optional(),
  })
  .meta({ id: 'FeedContent' })
export type FeedContent = z.infer<typeof feedContentSchema>
