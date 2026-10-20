import { describe, expect, it } from 'vitest'
import { isoWeek } from './TodayWidget.tsx'

describe('isoWeek', () => {
  it.each([
    ['2026-01-01', 1],
    ['2026-01-04', 1],
    ['2026-01-05', 2],
    ['2026-12-31', 53],
    ['2027-01-01', 53],
    ['2027-01-04', 1],
    ['2024-12-30', 1],
    ['2021-01-03', 53],
  ])('%s is week %i', (iso, week) => {
    const [y, m, d] = iso.split('-').map(Number)
    expect(isoWeek(new Date(y!, m! - 1, d!))).toBe(week)
  })
})
