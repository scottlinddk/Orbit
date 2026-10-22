import { MealsHostContext, type MealsHost } from '@orbit/module-meals/web'
import { useMemo, type ReactNode } from 'react'
import { useMealPlan, useRecipe } from '../api/meals.ts'

/**
 * Gives the meal widget its data. The widget cannot reach the API client itself, so the app lends
 * it these hooks, bound to the household of the dashboard being shown. Nothing is requested
 * unless the dashboard has a meal widget (`enabled`).
 */
export function MealsHostProvider({
  householdId,
  enabled,
  children,
}: {
  householdId: string
  enabled: boolean
  children: ReactNode
}) {
  const host = useMemo<MealsHost>(
    () => ({
      useMealPlan(from, to) {
        const query = useMealPlan(householdId, from, to, enabled)
        if (!enabled) return { status: 'none', meals: [], failing: [] }
        if (query.isError) return { status: 'error', meals: [], failing: [] }
        if (query.isPending) return { status: 'pending', meals: [], failing: [] }
        // No meal plan connected: the widget says how to connect one instead of an empty week.
        if (query.data.sources.length === 0) return { status: 'none', meals: [], failing: [] }
        return {
          status: 'ready',
          meals: query.data.entries.map((e) => ({
            id: `${e.recipe?.connectionId ?? ''}:${e.id}`,
            date: e.date,
            type: e.type,
            title: e.title,
            note: e.note,
            recipe:
              e.recipe === undefined
                ? undefined
                : { connectionId: e.recipe.connectionId, ref: e.recipe.ref },
          })),
          failing: query.data.sources.filter((s) => !s.ok).map((s) => s.name),
        }
      },

      useRecipe(connectionId, recipeRef) {
        const query = useRecipe(householdId, connectionId, recipeRef)
        return {
          status:
            connectionId === undefined || recipeRef === undefined
              ? 'idle'
              : query.isPending
                ? 'pending'
                : query.isError
                  ? 'error'
                  : 'ready',
          name: query.data?.name ?? '',
          description: query.data?.description,
          servings: query.data?.servings,
          ingredients: query.data?.ingredients ?? [],
          instructions: query.data?.instructions ?? [],
          error: query.error?.message,
        }
      },
    }),
    [householdId, enabled],
  )
  return <MealsHostContext.Provider value={host}>{children}</MealsHostContext.Provider>
}
