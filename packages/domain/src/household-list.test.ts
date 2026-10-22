import { describe, expect, it } from 'vitest'
import {
  HouseholdId,
  InvariantViolation,
  ListId,
  ListItemId,
  MAX_ITEMS_PER_LIST,
  UserId,
  addListItem,
  createList,
  moveListItem,
  openListItems,
  renameList,
  toTodoList,
  updateListItem,
  type HouseholdListItem,
} from './index.ts'

const by = UserId('alice')
const now = new Date('2026-01-01T00:00:00Z')
const later = new Date('2026-01-02T00:00:00Z')
const listId = ListId('l1')

const list = createList({
  id: listId,
  householdId: HouseholdId('h1'),
  name: '  Groceries ',
  kind: 'shopping',
  createdBy: by,
  now,
})

function withItem(items: HouseholdListItem[], id: string, text = id, extra = {}) {
  const added = addListItem(items, { id: ListItemId(id), listId, text, by, now, ...extra })
  return [...items, added]
}

describe('lists', () => {
  it('trims names and rejects empty, long and unknown kinds', () => {
    expect(list.name).toBe('Groceries')
    expect(() => renameList(list, '  ')).toThrow(InvariantViolation)
    expect(() => renameList(list, 'x'.repeat(81))).toThrow(InvariantViolation)
    expect(() => createList({ ...list, kind: 'poll' as never, now, createdBy: by })).toThrow(
      InvariantViolation,
    )
    expect(renameList(list, 'Weekend').name).toBe('Weekend')
  })

  it('appends items with increasing positions and validates text', () => {
    let items = withItem([], 'a')
    items = withItem(items, 'b')
    expect(items.map((i) => i.position)).toEqual([0, 1])
    expect(() => addListItem(items, { id: ListItemId('c'), listId, text: ' ', by, now })).toThrow(
      InvariantViolation,
    )
    expect(() =>
      addListItem(items, { id: ListItemId('c'), listId, text: 'x'.repeat(201), by, now }),
    ).toThrow(InvariantViolation)
  })

  it('refuses to grow past the item limit', () => {
    let items: HouseholdListItem[] = []
    for (let n = 0; n < MAX_ITEMS_PER_LIST; n++) items = withItem(items, `i${n}`)
    expect(() => withItem(items, 'one-more')).toThrow(InvariantViolation)
  })

  it('treats a blank quantity as none and clears with null', () => {
    const [milk] = withItem([], 'milk', 'Milk', { quantity: '  ', note: 'oat' })
    expect(milk!.quantity).toBeUndefined()
    const withQty = updateListItem(milk!, { quantity: '2 l' }, by, later)
    expect(withQty.quantity).toBe('2 l')
    expect(updateListItem(withQty, { quantity: null }, by, later).quantity).toBeUndefined()
    expect(updateListItem(withQty, { note: null }, by, later).note).toBeUndefined()
    expect(updateListItem(withQty, {}, by, later).quantity).toBe('2 l')
  })

  it('updates only the given fields and stamps who and when', () => {
    const [milk] = withItem([], 'milk', 'Milk')
    const done = updateListItem(milk!, { done: true }, UserId('bob'), later)
    expect(done).toMatchObject({ text: 'Milk', done: true, updatedBy: 'bob', updatedAt: later })
    expect(done.createdBy).toBe('alice')
    expect(() => updateListItem(milk!, { text: '' }, by, later)).toThrow(InvariantViolation)
  })

  it('moves an item and renumbers, returning only what changed', () => {
    let items = withItem([], 'a')
    items = withItem(items, 'b')
    items = withItem(items, 'c')
    const changed = moveListItem(items, ListItemId('c'), 0)
    expect(changed.map((i) => [i.id, i.position])).toEqual([
      ['c', 0],
      ['a', 1],
      ['b', 2],
    ])
    expect(moveListItem(items, ListItemId('b'), 1)).toEqual([])
    expect(moveListItem(items, ListItemId('a'), 99).map((i) => i.id)).toEqual(['b', 'c', 'a'])
    expect(() => moveListItem(items, ListItemId('zzz'), 0)).toThrow(InvariantViolation)
    expect(() => moveListItem(items, ListItemId('a'), -1)).toThrow(InvariantViolation)
  })

  it('lists open items in order and maps into the neutral model', () => {
    let items = withItem([], 'a', 'Apples', { quantity: '6' })
    items = withItem(items, 'b', 'Bread')
    items = [items[0]!, updateListItem(items[1]!, { done: true }, by, later)]
    expect(openListItems(items).map((i) => i.text)).toEqual(['Apples'])
    const neutral = toTodoList(list, items)
    expect(neutral.items).toEqual([
      { id: 'a', title: 'Apples (6)', completed: false },
      { id: 'b', title: 'Bread', completed: true },
    ])
  })
})
