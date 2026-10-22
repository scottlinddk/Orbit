import { invariant } from './errors.ts'
import type { HouseholdId, ListId, ListItemId, UserId } from './ids.ts'
import type { ListItem as NeutralListItem, TodoList } from './list.ts'

export const LIST_KINDS = ['shopping', 'todo'] as const
export type ListKind = (typeof LIST_KINDS)[number]

export const MAX_LISTS_PER_HOUSEHOLD = 50
export const MAX_ITEMS_PER_LIST = 500
export const MAX_LIST_NAME = 80
export const MAX_ITEM_TEXT = 200
export const MAX_ITEM_QUANTITY = 40
export const MAX_ITEM_NOTE = 500

/**
 * A list kept by Orbit itself, shared by the whole household. Other sources (Home Assistant,
 * Grocy) map into the source-neutral `TodoList`; `toTodoList` does the same for this one.
 */
export interface HouseholdList {
  readonly id: ListId
  readonly householdId: HouseholdId
  readonly name: string
  readonly kind: ListKind
  readonly createdBy: UserId
  readonly createdAt: Date
}

export interface HouseholdListItem {
  readonly id: ListItemId
  readonly listId: ListId
  readonly text: string
  readonly done: boolean
  /** Free text such as `2 kg` or `a dozen`. Not parsed. */
  readonly quantity?: string
  readonly note?: string
  /** Display order is position order. Deletions can leave gaps, moves renumber. */
  readonly position: number
  readonly createdBy: UserId
  readonly createdAt: Date
  readonly updatedBy: UserId
  readonly updatedAt: Date
}

function bounded(label: string, value: string, max: number): string {
  const trimmed = value.trim()
  invariant(trimmed.length > 0 && trimmed.length <= max, `${label} must be 1 to ${max} characters`)
  return trimmed
}

/** Empty or missing means "none". Too long is a rule violation. */
function optional(label: string, value: string | null | undefined, max: number) {
  if (value === undefined || value === null) return undefined
  const trimmed = value.trim()
  if (trimmed.length === 0) return undefined
  invariant(trimmed.length <= max, `${label} must be at most ${max} characters`)
  return trimmed
}

export function createList(input: {
  id: ListId
  householdId: HouseholdId
  name: string
  kind: ListKind
  createdBy: UserId
  now: Date
}): HouseholdList {
  invariant((LIST_KINDS as readonly string[]).includes(input.kind), 'Unknown list kind')
  return {
    id: input.id,
    householdId: input.householdId,
    name: bounded('List name', input.name, MAX_LIST_NAME),
    kind: input.kind,
    createdBy: input.createdBy,
    createdAt: input.now,
  }
}

export function renameList(list: HouseholdList, name: string): HouseholdList {
  return { ...list, name: bounded('List name', name, MAX_LIST_NAME) }
}

/** Appends to the end. `items` is the list's current items, used for the limit and position. */
export function addListItem(
  items: readonly HouseholdListItem[],
  input: {
    id: ListItemId
    listId: ListId
    text: string
    quantity?: string | undefined
    note?: string | undefined
    by: UserId
    now: Date
  },
): HouseholdListItem {
  invariant(items.length < MAX_ITEMS_PER_LIST, `A list holds at most ${MAX_ITEMS_PER_LIST} items`)
  const quantity = optional('Quantity', input.quantity, MAX_ITEM_QUANTITY)
  const note = optional('Note', input.note, MAX_ITEM_NOTE)
  return {
    id: input.id,
    listId: input.listId,
    text: bounded('Item text', input.text, MAX_ITEM_TEXT),
    done: false,
    ...(quantity === undefined ? {} : { quantity }),
    ...(note === undefined ? {} : { note }),
    position: items.reduce((next, i) => Math.max(next, i.position + 1), 0),
    createdBy: input.by,
    createdAt: input.now,
    updatedBy: input.by,
    updatedAt: input.now,
  }
}

/**
 * Changes only the fields given. `null` or an empty string clears the quantity or note. Last
 * write wins: two people editing the same item at once do not conflict, the later save is kept.
 */
export function updateListItem(
  item: HouseholdListItem,
  change: {
    text?: string | undefined
    done?: boolean | undefined
    quantity?: string | null | undefined
    note?: string | null | undefined
  },
  by: UserId,
  now: Date,
): HouseholdListItem {
  const { quantity: oldQuantity, note: oldNote, ...rest } = item
  const quantity =
    change.quantity === undefined
      ? oldQuantity
      : optional('Quantity', change.quantity, MAX_ITEM_QUANTITY)
  const note = change.note === undefined ? oldNote : optional('Note', change.note, MAX_ITEM_NOTE)
  return {
    ...rest,
    text: change.text === undefined ? item.text : bounded('Item text', change.text, MAX_ITEM_TEXT),
    done: change.done ?? item.done,
    ...(quantity === undefined ? {} : { quantity }),
    ...(note === undefined ? {} : { note }),
    updatedBy: by,
    updatedAt: now,
  }
}

/**
 * Moves one item to `toIndex` (clamped) and renumbers positions 0..n-1. Returns only the items
 * whose position changed, so the caller saves no more than it must.
 */
export function moveListItem(
  items: readonly HouseholdListItem[],
  itemId: ListItemId,
  toIndex: number,
): HouseholdListItem[] {
  invariant(Number.isInteger(toIndex) && toIndex >= 0, 'Position must be a whole number')
  const ordered = [...items].sort((a, b) => a.position - b.position)
  const from = ordered.findIndex((i) => i.id === itemId)
  invariant(from >= 0, 'Item not in list')
  const [moved] = ordered.splice(from, 1)
  ordered.splice(Math.min(toIndex, ordered.length), 0, moved!)
  return ordered.flatMap((item, position) =>
    item.position === position ? [] : [{ ...item, position }],
  )
}

/** Open items in display order. */
export const openListItems = (items: readonly HouseholdListItem[]) =>
  [...items].sort((a, b) => a.position - b.position).filter((i) => !i.done)

/** The source-neutral view of a stored list, for code that handles lists from any source. */
export function toTodoList(list: HouseholdList, items: readonly HouseholdListItem[]): TodoList {
  return {
    id: list.id,
    name: list.name,
    items: [...items]
      .sort((a, b) => a.position - b.position)
      .map((i): NeutralListItem => ({
        id: i.id,
        title: i.quantity === undefined ? i.text : `${i.text} (${i.quantity})`,
        completed: i.done,
        ...(i.note === undefined ? {} : { notes: i.note }),
      })),
  }
}
