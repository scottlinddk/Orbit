import { z } from 'zod'

/** The same shapes as `WidgetOption` in `@orbit/widget-sdk`, so a Planet's form is a widget form. */
const optionBase = { key: z.string(), label: z.string(), help: z.string().optional() }
export const planetOptionSchema = z.discriminatedUnion('kind', [
  z.object({
    ...optionBase,
    kind: z.literal('select'),
    choices: z.array(z.object({ value: z.string(), label: z.string() })),
    default: z.string(),
  }),
  z.object({
    ...optionBase,
    kind: z.literal('number'),
    min: z.number(),
    max: z.number(),
    step: z.number().optional(),
    default: z.number(),
  }),
  z.object({ ...optionBase, kind: z.literal('toggle'), default: z.boolean() }),
  z.object({
    ...optionBase,
    kind: z.literal('text'),
    maxLength: z.number().int(),
    default: z.string(),
  }),
])

/** An installed Planet, described as the widget it adds to the editor. */
export const planetWidgetSchema = z.object({
  type: z.string().describe('Widget type, always `planet.<id>`.'),
  planetId: z.string(),
  title: z.string(),
  description: z.string(),
  defaultSpan: z.number().int(),
  options: z.array(planetOptionSchema),
})
export type PlanetWidgetResponse = z.infer<typeof planetWidgetSchema>

export const planetRenderSchema = z.object({
  html: z.string().describe('Escaped markup produced by the Planet template. Show it sandboxed.'),
  updatedAt: z.string().optional().describe('When the data was last fetched successfully.'),
  stale: z.boolean().describe('True when the last refresh failed and older data is shown.'),
  error: z.string().optional().describe('Why the data is stale, or why the template failed.'),
})
export type PlanetRenderResponse = z.infer<typeof planetRenderSchema>
