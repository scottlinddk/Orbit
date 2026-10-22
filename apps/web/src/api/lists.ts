import { listSchema, listSummarySchema, type ListResponse } from '@orbit/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { useSignedIn } from './auth.ts'
import { request } from './client.ts'
import { keys } from './keys.ts'

const summariesSchema = z.object({ lists: z.array(listSummarySchema) })
const enc = encodeURIComponent
/** Other people change a shared list while a wall screen is open, so it is re-read now and then. */
const REFRESH_MS = 30 * 1000

const base = (householdId: string) => `/households/${enc(householdId)}/lists`

export function useListSummaries(householdId: string) {
  const signedIn = useSignedIn()
  return useQuery({
    enabled: signedIn && householdId !== '',
    queryKey: keys.lists(householdId),
    queryFn: async () =>
      (await request('GET', base(householdId), { schema: summariesSchema })).lists,
    refetchInterval: REFRESH_MS,
    retry: false,
  })
}

export function useList(householdId: string, listId: string | undefined) {
  const signedIn = useSignedIn()
  return useQuery({
    enabled: signedIn && householdId !== '' && listId !== undefined,
    queryKey: keys.list(householdId, listId ?? ''),
    queryFn: () =>
      request('GET', `${base(householdId)}/${enc(listId ?? '')}`, { schema: listSchema }),
    refetchInterval: REFRESH_MS,
    retry: false,
  })
}

/** Puts the server's version of a list into the cache and refreshes the counts. */
function useCacheList(householdId: string) {
  const queryClient = useQueryClient()
  return (list: ListResponse) => {
    queryClient.setQueryData(keys.list(householdId, list.id), list)
    void queryClient.invalidateQueries({ queryKey: keys.lists(householdId), exact: true })
  }
}

export function useCreateList(householdId: string) {
  const cache = useCacheList(householdId)
  return useMutation({
    mutationFn: (input: { name: string; kind: 'shopping' | 'todo' }) =>
      request('POST', base(householdId), { body: input, schema: listSchema }),
    onSuccess: cache,
  })
}

export function useAddListItem(householdId: string, listId: string) {
  const cache = useCacheList(householdId)
  return useMutation({
    mutationFn: (text: string) =>
      request('POST', `${base(householdId)}/${enc(listId)}/items`, {
        body: { text },
        schema: listSchema,
      }),
    onSuccess: cache,
  })
}

/**
 * Ticking an item shows at once and is undone if the server refuses, because at the shop a
 * checkbox that waits for the network feels broken. The server's answer replaces the guess.
 */
export function useSetItemDone(householdId: string, listId: string) {
  const queryClient = useQueryClient()
  const cache = useCacheList(householdId)
  const key = keys.list(householdId, listId)
  return useMutation({
    mutationFn: ({ itemId, done }: { itemId: string; done: boolean }) =>
      request('PATCH', `${base(householdId)}/${enc(listId)}/items/${enc(itemId)}`, {
        body: { done },
        schema: listSchema,
      }),
    onMutate: async ({ itemId, done }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<ListResponse>(key)
      if (previous)
        queryClient.setQueryData<ListResponse>(key, {
          ...previous,
          items: previous.items.map((i) => (i.id === itemId ? { ...i, done } : i)),
        })
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous)
    },
    onSuccess: cache,
  })
}

export function useClearCompleted(householdId: string, listId: string) {
  const cache = useCacheList(householdId)
  return useMutation({
    mutationFn: () =>
      request('POST', `${base(householdId)}/${enc(listId)}/clear-completed`, {
        body: {},
        schema: listSchema,
      }),
    onSuccess: cache,
  })
}
