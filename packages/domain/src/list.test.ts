import { describe, expect, it } from 'vitest'
import { openItemCount, sortedItems, type ListItem, type TodoList } from './list.ts'

const item = (id: string, extra: Partial<ListItem> = {}): ListItem => ({
  id,
  title: id,
  completed: false,
  ...extra,
})
const list = (...items: ListItem[]): TodoList => ({
  id: 'todo.groceries',
  name: 'Groceries',
  items,
})

describe('openItemCount', () => {
  it('counts items that are not completed', () => {
    expect(openItemCount(list(item('a'), item('b', { completed: true }), item('c')))).toBe(2)
    expect(openItemCount(list())).toBe(0)
  })
})

describe('sortedItems', () => {
  it('puts open items before completed ones', () => {
    const sorted = sortedItems(list(item('done', { completed: true }), item('todo')))
    expect(sorted.map((i) => i.id)).toEqual(['todo', 'done'])
  })

  it('orders open items by due time, with undated items last', () => {
    const sorted = sortedItems(
      list(
        item('none'),
        item('later', { due: { kind: 'date', date: '2026-03-12' } }),
        item('soon', { due: { kind: 'datetime', at: '2026-03-10T08:00:00.000Z' } }),
      ),
    )
    expect(sorted.map((i) => i.id)).toEqual(['soon', 'later', 'none'])
  })

  it('treats a due date as the start of that day', () => {
    const sorted = sortedItems(
      list(
        item('evening', { due: { kind: 'datetime', at: '2026-03-10T18:00:00.000Z' } }),
        item('allday', { due: { kind: 'date', date: '2026-03-10' } }),
      ),
    )
    expect(sorted.map((i) => i.id)).toEqual(['allday', 'evening'])
  })

  it('falls back to the title, and ignores due dates once completed', () => {
    const sorted = sortedItems(
      list(
        item('b'),
        item('a'),
        item('y', { completed: true, due: { kind: 'date', date: '2026-01-01' } }),
        item('x', { completed: true }),
      ),
    )
    expect(sorted.map((i) => i.id)).toEqual(['a', 'b', 'x', 'y'])
  })

  it('does not change the list it is given', () => {
    const original = list(item('b'), item('a'))
    sortedItems(original)
    expect(original.items.map((i) => i.id)).toEqual(['b', 'a'])
  })
})
