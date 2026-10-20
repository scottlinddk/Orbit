import { describe, expect, it } from 'vitest'
import {
  BARS_PER_MONTH,
  calendarYear,
  monthsEnding,
  sampleCategories,
  sampleTransactions,
  seeded,
} from './sampleData.ts'

const APRIL = new Date(2026, 3, 15)

describe('seeded', () => {
  it('gives the same sequence for the same seed, and values in [0, 1)', () => {
    const a = seeded(42)
    const b = seeded(42)
    const first = Array.from({ length: 20 }, () => a())
    expect(Array.from({ length: 20 }, () => b())).toEqual(first)
    expect(first.every((n) => n >= 0 && n < 1)).toBe(true)
    expect(seeded(43)()).not.toBe(first[0])
  })
})

describe('monthsEnding', () => {
  it('returns consecutive months, oldest first, ending with the month of the date', () => {
    const months = monthsEnding(APRIL, 4)
    expect(months.map((m) => m.key)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04'])
  })

  it('crosses a year boundary', () => {
    expect(monthsEnding(new Date(2026, 1, 1), 4).map((m) => m.key)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ])
  })

  it('is deterministic, so a chart does not change between renders', () => {
    expect(monthsEnding(APRIL, 6)).toEqual(monthsEnding(new Date(2026, 3, 30), 6))
  })

  it('draws a fixed number of bars per month, inside the chart range', () => {
    for (const month of monthsEnding(APRIL, 12)) {
      expect(month.bars).toHaveLength(BARS_PER_MONTH)
      for (const bar of month.bars) {
        expect(bar).toBeGreaterThanOrEqual(450)
        expect(bar).toBeLessThanOrEqual(2000)
      }
    }
  })

  it('reports each month against the one before it, including the first one shown', () => {
    const longer = monthsEnding(APRIL, 3)
    const shorter = monthsEnding(APRIL, 2)
    // The first month of the shorter range is compared with a month it does not show.
    expect(shorter[0]!.change).toBe(longer[1]!.change)
    const [prev, current] = longer.slice(1) as [(typeof longer)[0], (typeof longer)[0]]
    expect(longer[2]!.change).toBe(
      Math.round(((longer[2]!.amount - longer[1]!.amount) / longer[1]!.amount) * 10_000) / 100,
    )
    expect(prev.key < current.key).toBe(true)
  })

  it('rounds amounts to cents', () => {
    for (const m of monthsEnding(APRIL, 12))
      expect(Math.round(m.amount * 100)).toBeCloseTo(m.amount * 100, 6)
  })
})

describe('calendarYear', () => {
  it('is January to December of the date’s year', () => {
    const year = calendarYear(APRIL)
    expect(year).toHaveLength(12)
    expect(year[0]!.key).toBe('2026-01')
    expect(year[11]!.key).toBe('2026-12')
  })
})

describe('sample lists', () => {
  it('has unique ids and sorted-by-recency money out as negatives', () => {
    expect(new Set(sampleTransactions.map((t) => t.id)).size).toBe(sampleTransactions.length)
    expect(new Set(sampleCategories.map((c) => c.id)).size).toBe(sampleCategories.length)
    expect(sampleTransactions.some((t) => t.amount < 0)).toBe(true)
    expect(sampleTransactions.some((t) => t.amount > 0)).toBe(true)
  })
})
