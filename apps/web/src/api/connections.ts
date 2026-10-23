import {
  connectionSchema,
  connectionTestSchema,
  discoveredEntitySchema,
  type ConnectionResponse,
} from '@orbit/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { useSignedIn } from './auth.ts'
import { request } from './client.ts'
import { keys } from './keys.ts'

const listSchema = z.object({ connections: z.array(connectionSchema) })
const entitiesSchema = z.object({ entities: z.array(discoveredEntitySchema) })
const enc = encodeURIComponent

const base = (householdId: string) => `/households/${enc(householdId)}/connections`

/** Owners only. Everyone else sees the mirrored calendars and lists, not the connection. */
export function useConnections(householdId: string) {
  const signedIn = useSignedIn()
  return useQuery({
    enabled: signedIn && householdId !== '',
    queryKey: keys.connections(householdId),
    queryFn: async () =>
      (await request('GET', base(householdId), { schema: listSchema })).connections,
  })
}

/** What the other system holds, fetched on demand because it calls out to that system. */
export function useConnectionEntities(householdId: string, connectionId: string, enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: keys.connectionEntities(householdId, connectionId),
    queryFn: async () =>
      (
        await request('GET', `${base(householdId)}/${enc(connectionId)}/entities`, {
          schema: entitiesSchema,
        })
      ).entities,
    retry: false,
    staleTime: 0,
  })
}

/** Calendars and lists that were mirrored or un-mirrored show up in the household at once. */
function useRefreshHousehold(householdId: string) {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: keys.connections(householdId) })
    void queryClient.invalidateQueries({ queryKey: keys.calendarEvents(householdId) })
    void queryClient.invalidateQueries({ queryKey: keys.lists(householdId) })
    void queryClient.invalidateQueries({ queryKey: keys.mealsAll(householdId) })
    void queryClient.invalidateQueries({ queryKey: keys.stock(householdId) })
  }
}

export function useAddConnection(householdId: string) {
  const refresh = useRefreshHousehold(householdId)
  return useMutation({
    mutationFn: (input: {
      kind: 'homeassistant' | 'mealie' | 'grocy'
      name: string
      url: string
      token: string
    }) =>
      request('POST', base(householdId), {
        body: input,
        schema: connectionSchema,
      }),
    onSuccess: refresh,
  })
}

export function useRemoveConnection(householdId: string) {
  const refresh = useRefreshHousehold(householdId)
  return useMutation({
    mutationFn: (connectionId: string) =>
      request('DELETE', `${base(householdId)}/${enc(connectionId)}`),
    onSuccess: refresh,
  })
}

export function useTestConnection(householdId: string) {
  return useMutation({
    mutationFn: (connectionId: string) =>
      request('POST', `${base(householdId)}/${enc(connectionId)}/test`, {
        schema: connectionTestSchema,
      }),
  })
}

export function useSetMirrors(householdId: string) {
  const refresh = useRefreshHousehold(householdId)
  return useMutation({
    mutationFn: ({ connectionId, entityIds }: { connectionId: string; entityIds: string[] }) =>
      request('PUT', `${base(householdId)}/${enc(connectionId)}/mirrors`, {
        body: { entityIds },
        schema: connectionSchema,
      }),
    onSuccess: refresh,
  })
}

export type { ConnectionResponse }
