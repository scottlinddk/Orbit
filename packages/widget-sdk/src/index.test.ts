import { describe, expect, it } from 'vitest'
import { WIDGET_API_VERSION, resolveOptions, type WidgetOption } from './index.ts'

const options: readonly WidgetOption[] = [
  {
    kind: 'select',
    key: 'period',
    label: 'Period',
    choices: [
      { value: 'week', label: 'Week' },
      { value: 'year', label: 'Year' },
    ],
    default: 'year',
  },
  { kind: 'number', key: 'rows', label: 'Rows', min: 2, max: 8, default: 4 },
  { kind: 'toggle', key: 'compact', label: 'Compact', default: false },
  { kind: 'text', key: 'title', label: 'Title', maxLength: 5, default: 'Hi' },
]

describe('WIDGET_API_VERSION', () => {
  it('is a positive whole number', () => {
    expect(Number.isInteger(WIDGET_API_VERSION)).toBe(true)
    expect(WIDGET_API_VERSION).toBeGreaterThanOrEqual(1)
  })
})

describe('resolveOptions', () => {
  it('uses valid saved values', () => {
    expect(
      resolveOptions(options, { period: 'week', rows: 6, compact: true, title: 'Home' }),
    ).toEqual({ period: 'week', rows: 6, compact: true, title: 'Home' })
  })

  it('falls back to the default for anything invalid, and never throws', () => {
    expect(
      resolveOptions(options, { period: 'decade', rows: 'many', compact: 'yes', title: 42 }),
    ).toEqual({ period: 'year', rows: 4, compact: false, title: 'Hi' })
  })

  it('clamps numbers and cuts long text to the limits', () => {
    expect(resolveOptions(options, { rows: 99, title: 'too long' })).toMatchObject({
      rows: 8,
      title: 'too l',
    })
    expect(resolveOptions(options, { rows: -1 })).toMatchObject({ rows: 2 })
  })

  it('returns nothing for a widget without options', () => {
    expect(resolveOptions(undefined, { anything: 1 })).toEqual({})
  })
})
