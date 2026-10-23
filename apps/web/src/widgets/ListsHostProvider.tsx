import { ListsHostContext, type ListsHost } from '@orbit/module-lists/web'
import { useMemo, type ReactNode } from 'react'
import {
  useAddListItem,
  useClearCompleted,
  useCreateList,
  useList,
  useListSummaries,
  useSetItemDone,
} from '../api/lists.ts'

/**
 * Gives the lists widgets their data. The widgets cannot reach the API client themselves, so the
 * app lends them these hooks, bound to the household of the dashboard being shown.
 */
export function ListsHostProvider({
  householdId,
  readOnly = false,
  children,
}: {
  householdId: string
  readOnly?: boolean
  children: ReactNode
}) {
  const host = useMemo<ListsHost>(
    () => ({
      readOnly,
      useLists() {
        const query = useListSummaries(householdId)
        return {
          status: query.isPending ? 'pending' : query.isError ? 'error' : 'ready',
          lists: query.data ?? [],
        }
      },

      useList(listId) {
        const query = useList(householdId, listId)
        // The mutations need a list id even when there is none yet. They are never called then.
        const id = listId ?? ''
        const setDone = useSetItemDone(householdId, id)
        const add = useAddListItem(householdId, id)
        const clear = useClearCompleted(householdId, id)
        return {
          status:
            listId === undefined
              ? 'idle'
              : query.isPending
                ? 'pending'
                : query.isError
                  ? 'error'
                  : 'ready',
          name: query.data?.name ?? '',
          items: query.data?.items ?? [],
          readOnly: query.data?.readOnly ?? false,
          syncError: query.data?.syncError,
          error: (setDone.error ?? add.error ?? clear.error)?.message,
          setDone: (itemId, done) => setDone.mutate({ itemId, done }),
          add: (text) => add.mutate(text),
          clearCompleted: () => clear.mutate(),
        }
      },

      useCreateList() {
        const create = useCreateList(householdId)
        return {
          create: (name) => create.mutate({ name, kind: 'shopping' }),
          busy: create.isPending,
          error: create.error?.message,
        }
      },
    }),
    [householdId, readOnly],
  )
  return <ListsHostContext.Provider value={host}>{children}</ListsHostContext.Provider>
}
