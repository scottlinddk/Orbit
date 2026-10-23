import { createContext } from 'react'

export interface MealView {
  readonly id: string
  /** A plain `YYYY-MM-DD`. */
  readonly date: string
  readonly type: string
  readonly title: string
  readonly note?: string | undefined
  /** Present when the meal points to a recipe that can be opened. */
  readonly recipe?: { readonly connectionId: string; readonly ref: string } | undefined
}

export interface MealPlanView {
  /**
   * - `unavailable`: drawn outside the app, for example in a test.
   * - `none`: no meal plan is connected.
   */
  readonly status: 'unavailable' | 'none' | 'pending' | 'error' | 'ready'
  readonly meals: readonly MealView[]
  /** Plans whose last refresh failed. Their older entries are still included. */
  readonly failing: readonly string[]
}

export interface RecipeView {
  readonly status: 'idle' | 'pending' | 'error' | 'ready'
  readonly name: string
  readonly description: string | undefined
  readonly servings: number | undefined
  readonly ingredients: readonly string[]
  readonly instructions: readonly string[]
  readonly error: string | undefined
}

/**
 * What the meal widget needs from the app. Widgets cannot reach the API client, so the app
 * provides these hooks. They are always called in the same order.
 */
export interface MealsHost {
  /** Meals from `from` to `to`, both `YYYY-MM-DD` and inclusive. */
  useMealPlan(from: string, to: string): MealPlanView
  /** Idle until a recipe is asked for. */
  useRecipe(connectionId: string | undefined, ref: string | undefined): RecipeView
}

const unavailable: MealsHost = {
  useMealPlan: () => ({ status: 'unavailable', meals: [], failing: [] }),
  useRecipe: () => ({
    status: 'idle',
    name: '',
    description: undefined,
    servings: undefined,
    ingredients: [],
    instructions: [],
    error: undefined,
  }),
}

export const MealsHostContext = createContext<MealsHost>(unavailable)
