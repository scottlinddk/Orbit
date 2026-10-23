import { addDays } from './calendar-day.ts'

/** What Mealie calls the slot of a plan entry. Unknown values are shown as `dinner`. */
export const MEAL_TYPES = [
  'breakfast',
  'lunch',
  'dinner',
  'side',
  'snack',
  'drink',
  'dessert',
] as const
export type MealType = (typeof MEAL_TYPES)[number]

export const MAX_MEAL_ENTRIES = 300
export const MAX_RECIPE_LINES = 200
export const MAX_MEAL_RANGE_DAYS = 31
/** A feed shows at most this many meals and stock items, far below its size cap. */
export const FEED_MEALS_LIMIT = 20
export const FEED_STOCK_LIMIT = 20

/** One planned meal on one day. `date` is a plain `YYYY-MM-DD`, with no time zone. */
export interface MealPlanEntry {
  readonly id: string
  readonly date: string
  readonly type: MealType
  readonly title: string
  readonly note?: string
  /** The recipe in the other system, when the entry points to one. */
  readonly recipe?: { readonly ref: string; readonly name: string }
}

/** A recipe as far as Orbit shows it. No image: its address would reveal the connection. */
export interface MealRecipe {
  readonly ref: string
  readonly name: string
  readonly description?: string
  readonly servings?: number
  readonly ingredients: readonly string[]
  readonly instructions: readonly string[]
}

export const STOCK_STATUSES = ['expired', 'overdue', 'due-soon', 'missing'] as const
export type StockStatus = (typeof STOCK_STATUSES)[number]

/** Something in the pantry that needs attention, or that is running out. */
export interface StockItem {
  readonly id: string
  readonly name: string
  readonly status: StockStatus
  readonly amount: number
  /** `YYYY-MM-DD`, when the product has a best-before date that matters. */
  readonly bestBefore?: string
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
export const isPlainDate = (value: string) => DATE.test(value) && !Number.isNaN(Date.parse(value))

export const normalizeMealType = (value: unknown): MealType =>
  typeof value === 'string' && (MEAL_TYPES as readonly string[]).includes(value.toLowerCase())
    ? (value.toLowerCase() as MealType)
    : 'dinner'

/** The last date of a range of `days` days starting at `from`, inclusive. */
export const rangeEnd = (from: string, days: number) => addDays(from, days - 1)

/** What a feed shows for a meal: just the slot and the title. */
export interface MealGlance {
  readonly type: MealType
  readonly title: string
}

/** The meals planned for `today`, in the order of a day, capped. */
export function mealsToday(entries: readonly MealPlanEntry[], today: string): MealGlance[] {
  return entries
    .filter((e) => e.date === today)
    .sort((a, b) => MEAL_TYPES.indexOf(a.type) - MEAL_TYPES.indexOf(b.type))
    .slice(0, FEED_MEALS_LIMIT)
    .map((e) => ({ type: e.type, title: e.title }))
}

/** What a feed shows for a stock item. */
export interface StockGlance {
  readonly name: string
  readonly status: StockStatus
  readonly bestBefore?: string
}

/** The most urgent stock items first: expired, overdue, due soon, then running low. */
export function stockExpiring(items: readonly StockItem[]): StockGlance[] {
  return [...items]
    .sort(
      (a, b) =>
        STOCK_STATUSES.indexOf(a.status) - STOCK_STATUSES.indexOf(b.status) ||
        (a.bestBefore ?? '9999').localeCompare(b.bestBefore ?? '9999') ||
        a.name.localeCompare(b.name),
    )
    .slice(0, FEED_STOCK_LIMIT)
    .map((i) => ({
      name: i.name,
      status: i.status,
      ...(i.bestBefore === undefined ? {} : { bestBefore: i.bestBefore }),
    }))
}
