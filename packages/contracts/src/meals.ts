import { z } from 'zod'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-22')

export const mealTypeSchema = z.enum([
  'breakfast',
  'lunch',
  'dinner',
  'side',
  'snack',
  'drink',
  'dessert',
])

export const mealPlanQuerySchema = z.strictObject({
  /** First day, inclusive. Defaults to today (UTC). */
  from: date.optional(),
  /** Last day, inclusive. Defaults to six days after `from`. At most 31 days in all. */
  to: date.optional(),
})

export const mealEntrySchema = z
  .object({
    id: z.string(),
    /** A plain date, with no time zone. */
    date: z.string(),
    type: mealTypeSchema,
    title: z.string(),
    note: z.string().optional(),
    /** Present when the entry points to a recipe that can be opened. */
    recipe: z.object({ connectionId: z.string(), ref: z.string(), name: z.string() }).optional(),
  })
  .meta({ id: 'MealEntry' })

const sourceStatusSchema = z.object({
  sourceId: z.string(),
  name: z.string(),
  ok: z.boolean(),
  /** When the last good copy was read, or null if it never was. */
  fetchedAt: z.string().nullable(),
  /** Safe to show. Never contains the address or the token. */
  error: z.string().optional(),
})

export const mealPlanSchema = z
  .object({
    entries: z.array(mealEntrySchema),
    /** One per connected meal plan. If one cannot be read, its last good entries still show. */
    sources: z.array(sourceStatusSchema),
  })
  .meta({ id: 'MealPlan' })
export type MealPlanResponse = z.infer<typeof mealPlanSchema>

export const mealRecipeSchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    servings: z.number().optional(),
    ingredients: z.array(z.string()),
    instructions: z.array(z.string()),
  })
  .meta({ id: 'MealRecipe' })
export type MealRecipeResponse = z.infer<typeof mealRecipeSchema>

export const stockItemSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: z.enum(['expired', 'overdue', 'due-soon', 'missing']),
    amount: z.number(),
    /** `YYYY-MM-DD`. */
    bestBefore: z.string().optional(),
  })
  .meta({ id: 'StockItem' })

export const stockSchema = z
  .object({
    items: z.array(stockItemSchema),
    sources: z.array(sourceStatusSchema),
  })
  .meta({ id: 'Stock' })
export type StockResponse = z.infer<typeof stockSchema>
