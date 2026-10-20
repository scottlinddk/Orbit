import { resolveOptions, type WidgetOption } from '@orbit/widget-sdk'
import { describe, expect, it } from 'vitest'

const options: readonly WidgetOption[] = [
  {
    kind: 'select',
    key: 'view',
    label: 'View',
    choices: [
      { value: 'week', label: 'Week' },
      { value: 'month', label: 'Month' },
    ],
    default: 'week',
  },
  { kind: 'number', key: 'rows', label: 'Rows', min: 2, max: 8, default: 4 },
  { kind: 'toggle', key: 'compact', label: 'Compact', default: false },
  { kind: 'text', key: 'title', label: 'Title', maxLength: 5, default: 'Hi' },
]

describe('resolveOptions', () => {
  it('uses the defaults when nothing is saved', () => {
    expect(resolveOptions(options, {})).toEqual({
      view: 'week',
      rows: 4,
      compact: false,
      title: 'Hi',
    })
  })

  it('uses saved values that are valid', () => {
    expect(
      resolveOptions(options, { view: 'month', rows: 6, compact: true, title: 'Home' }),
    ).toEqual({ view: 'month', rows: 6, compact: true, title: 'Home' })
  })

  it('never throws on bad saved data: wrong types and unknown choices fall back', () => {
    expect(resolveOptions(options, { view: 'year', rows: '6', compact: 'yes', title: 7 })).toEqual({
      view: 'week',
      rows: 4,
      compact: false,
      title: 'Hi',
    })
    expect(resolveOptions(options, { rows: Number.NaN })).toMatchObject({ rows: 4 })
    expect(resolveOptions(options, { rows: Infinity })).toMatchObject({ rows: 4 })
  })

  it('clamps numbers into range and cuts text to its length', () => {
    expect(resolveOptions(options, { rows: 99, title: 'Too long' })).toMatchObject({
      rows: 8,
      title: 'Too l',
    })
    expect(resolveOptions(options, { rows: -3 })).toMatchObject({ rows: 2 })
  })

  it('ignores saved keys the widget does not declare, and handles no options at all', () => {
    expect(resolveOptions(options, { stray: 1 })).not.toHaveProperty('stray')
    expect(resolveOptions(undefined, { a: 1 })).toEqual({})
  })
})
