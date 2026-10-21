/**
 * A to-do or shopping list from any source (a Home Assistant `todo.*` entity today, Orbit's own
 * store if it ever has one). Sources map into these shapes so the rest of the app never sees a
 * vendor format, the same way calendar sources map into `CalendarEvent`.
 *
 * Deliberately small: what a household screen shows and what the common sources can all provide.
 * Source-specific fields (assignees, sub-tasks, recurrence) are left out until a second source
 * needs them.
 */

/** A due date with no time, or an exact instant. A date has no zone, so it never shifts days. */
export type ListItemDue =
  | { readonly kind: 'date'; /** `YYYY-MM-DD` */ readonly date: string }
  | { readonly kind: 'datetime'; /** ISO 8601 instant in UTC. */ readonly at: string }

export interface ListItem {
  /** Stable within its list, as given by the source. */
  readonly id: string
  readonly title: string
  readonly completed: boolean
  readonly due?: ListItemDue
  readonly notes?: string
}

export interface TodoList {
  /** Stable for the source, for example a Home Assistant entity id. */
  readonly id: string
  readonly name: string
  readonly items: readonly ListItem[]
}

/** The number of items still to do. */
export function openItemCount(list: TodoList): number {
  return list.items.filter((item) => !item.completed).length
}

/** A string that sorts in time order, or `undefined` when there is no due date. */
function dueKey(due: ListItemDue | undefined): string | undefined {
  if (!due) return undefined
  return due.kind === 'date' ? `${due.date}T00:00:00.000Z` : due.at
}

/**
 * Open items first. Among open items the one due soonest comes first and items without a due date
 * come last, then by title. Completed items follow, by title.
 */
export function compareListItems(a: ListItem, b: ListItem): number {
  if (a.completed !== b.completed) return a.completed ? 1 : -1
  if (!a.completed) {
    const da = dueKey(a.due)
    const db = dueKey(b.due)
    if (da !== db) {
      if (da === undefined) return 1
      if (db === undefined) return -1
      const byDue = da.localeCompare(db)
      if (byDue !== 0) return byDue
    }
  }
  return a.title.localeCompare(b.title)
}

/** A copy of the list with its items in display order. The input is not changed. */
export function sortedItems(list: TodoList): ListItem[] {
  return [...list.items].sort(compareListItems)
}
