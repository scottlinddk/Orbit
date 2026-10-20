import { householdSchema, type HouseholdResponse } from '@orbit/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { useSignedIn } from './auth.ts'
import { request } from './client.ts'
import { keys } from './keys.ts'

const listSchema = z.object({ households: z.array(householdSchema) })

export function useHouseholds() {
  const signedIn = useSignedIn()
  return useQuery({
    enabled: signedIn,
    queryKey: keys.households,
    queryFn: async () => (await request('GET', '/households', { schema: listSchema })).households,
  })
}

export function useHousehold(id: string) {
  const signedIn = useSignedIn()
  return useQuery({
    queryKey: keys.household(id),
    queryFn: () =>
      request('GET', `/households/${encodeURIComponent(id)}`, { schema: householdSchema }),
    // The dashboard page asks before it knows the household id. Do not request "/households/".
    enabled: signedIn && id !== '',
    retry: false,
  })
}

/** Stores a household returned by the server in both the single and the list cache. */
function useCacheHousehold() {
  const queryClient = useQueryClient()
  return (household: HouseholdResponse) => {
    queryClient.setQueryData(keys.household(household.id), household)
    void queryClient.invalidateQueries({ queryKey: keys.households, exact: true })
  }
}

export function useCreateHousehold() {
  const cache = useCacheHousehold()
  return useMutation({
    mutationFn: (input: { name: string }) =>
      request('POST', '/households', { body: input, schema: householdSchema }),
    onSuccess: cache,
  })
}

export function useAddMember(householdId: string) {
  const cache = useCacheHousehold()
  return useMutation({
    mutationFn: (input: { username: string }) =>
      request('POST', `/households/${encodeURIComponent(householdId)}/members`, {
        body: input,
        schema: householdSchema,
      }),
    onSuccess: cache,
  })
}

export function useRemoveMember(householdId: string) {
  const cache = useCacheHousehold()
  return useMutation({
    mutationFn: (userId: string) =>
      request(
        'DELETE',
        `/households/${encodeURIComponent(householdId)}/members/${encodeURIComponent(userId)}`,
        { schema: householdSchema },
      ),
    onSuccess: cache,
  })
}
