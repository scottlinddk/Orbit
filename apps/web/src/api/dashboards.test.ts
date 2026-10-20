import { describe, expect, it } from 'vitest'
import { moveInList } from './dashboards.ts'

const list = (...ids: string[]) => ids.map((id) => ({ id }))
const ids = (widgets: { id: string }[]) => widgets.map((w) => w.id)

describe('moveInList', () => {
  it('puts the widget at the target index, as the server does', () => {
    const widgets = list('a', 'b', 'c', 'd')
    expect(ids(moveInList(widgets, 'a', 3))).toEqual(['b', 'c', 'd', 'a'])
    expect(ids(moveInList(widgets, 'd', 0))).toEqual(['d', 'a', 'b', 'c'])
    expect(ids(moveInList(widgets, 'b', 1))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('leaves the list alone for an unknown widget, and never changes its input', () => {
    const widgets = list('a', 'b')
    expect(ids(moveInList(widgets, 'zzz', 0))).toEqual(['a', 'b'])
    moveInList(widgets, 'a', 1)
    expect(ids(widgets)).toEqual(['a', 'b'])
  })
})
