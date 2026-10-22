import { createContext } from 'react'

export interface ListSummaryView {
  readonly id: string
  readonly name: string
  readonly kind: 'shopping' | 'todo'
  readonly openCount: number
}

export interface ListItemView {
  readonly id: string
  readonly text: string
  readonly done: boolean
  readonly quantity?: string | undefined
}

export interface ListsView {
  /** `unavailable` when the widget is drawn outside the app, for example in a test. */
  readonly status: 'unavailable' | 'pending' | 'error' | 'ready'
  readonly lists: readonly ListSummaryView[]
}

export interface ListView {
  readonly status: 'idle' | 'pending' | 'error' | 'ready'
  readonly name: string
  readonly items: readonly ListItemView[]
  /** A list mirrored from another system: it can be read here and changed only there. */
  readonly readOnly: boolean
  /** Mirrored lists: why the last refresh failed. The items shown are then the last good ones. */
  readonly syncError: string | undefined
  /** The message of the last failed change, if any. */
  readonly error: string | undefined
  readonly setDone: (itemId: string, done: boolean) => void
  readonly add: (text: string) => void
  readonly clearCompleted: () => void
}

export interface CreateListView {
  readonly create: (name: string) => void
  readonly busy: boolean
  readonly error: string | undefined
}

/**
 * What the lists widgets need from the app. Widgets cannot reach the API client, so the app
 * provides these hooks. They are always called in the same order, so a host may use any hooks.
 */
export interface ListsHost {
  useLists(): ListsView
  useList(listId: string | undefined): ListView
  useCreateList(): CreateListView
}

const unavailable: ListsHost = {
  useLists: () => ({ status: 'unavailable', lists: [] }),
  useList: () => ({
    status: 'idle',
    name: '',
    items: [],
    readOnly: false,
    syncError: undefined,
    error: undefined,
    setDone: () => undefined,
    add: () => undefined,
    clearCompleted: () => undefined,
  }),
  useCreateList: () => ({ create: () => undefined, busy: false, error: undefined }),
}

export const ListsHostContext = createContext<ListsHost>(unavailable)
