import { mealPlanSchema, mealRecipeSchema, stockSchema } from '@orbit/contracts'
import { useQuery } from '@tanstack/react-query'
import { useSignedIn } from './auth.ts'
import { request } from './client.ts'
import { keys } from './keys.ts'

const enc = encodeURIComponent
const MINUTE = 60 * 1000

/**
 * Planned meals from `from` to `to` (plain dates, inclusive). The server reads Mealie at most
 * every five minutes, so asking once a minute only re-reads what it already has.
 */
export function useMealPlan(householdId: string, from: string, to: string, enabled = true) {
  const signedIn = useSignedIn()
  return useQuery({
    enabled: signedIn && enabled && householdId !== '',
    queryKey: keys.meals(householdId, from, to),
    queryFn: () =>
      request('GET', `/households/${enc(householdId)}/meals?from=${enc(from)}&to=${enc(to)}`, {
        schema: mealPlanSchema,
      }),
    refetchInterval: MINUTE,
    retry: false,
  })
}

/** One recipe, fetched when someone opens it. */
export function useRecipe(
  householdId: string,
  connectionId: string | undefined,
  recipeRef: string | undefined,
) {
  const signedIn = useSignedIn()
  const wanted = connectionId !== undefined && recipeRef !== undefined
  return useQuery({
    enabled: signedIn && wanted && householdId !== '',
    queryKey: keys.recipe(householdId, connectionId ?? '', recipeRef ?? ''),
    queryFn: () =>
      request(
        'GET',
        `/households/${enc(householdId)}/meals/recipes/${enc(connectionId ?? '')}/${enc(recipeRef ?? '')}`,
        { schema: mealRecipeSchema },
      ),
    retry: false,
  })
}

/** Stock that is expired, due soon or running out. */
export function useStock(householdId: string, enabled = true) {
  const signedIn = useSignedIn()
  return useQuery({
    enabled: signedIn && enabled && householdId !== '',
    queryKey: keys.stock(householdId),
    queryFn: () => request('GET', `/households/${enc(householdId)}/stock`, { schema: stockSchema }),
    refetchInterval: 5 * MINUTE,
    retry: false,
  })
}
