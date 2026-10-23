import { describe, expect, it } from 'vitest'
import type { MealView } from './host.ts'
import { addDays, dayLabel, groupByDay, localDay, typeLabel } from './plan.ts'

const meal = (over: Partial<MealView> & { id: string }): MealView => ({
  date: '2026-10-22',
  type: 'dinner',
  title: 'Soup',
  ...over,
})

describe('groupByDay', () => {
  it('orders days, and breakfast before dinner within a day', () => {
    const days = groupByDay([
      meal({ id: '1', date: '2026-10-23', type: 'dinner' }),
      meal({ id: '2', date: '2026-10-22', type: 'dinner' }),
      meal({ id: '3', date: '2026-10-22', type: 'breakfast' }),
    ])
    expect(days.map((d) => d.day)).toEqual(['2026-10-22', '2026-10-23'])
    expect(days[0]!.meals.map((m) => m.id)).toEqual(['3', '2'])
  })
})

describe('dates', () => {
  it('adds days across a month end', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
  })

  it("reads the viewer's own calendar day", () => {
    expect(localDay(new Date(2026, 9, 5, 23, 30))).toBe('2026-10-05')
  })

  it('names today and tomorrow, and otherwise the weekday', () => {
    expect(dayLabel('2026-10-22', '2026-10-22', 'en')).toBe('Today')
    expect(dayLabel('2026-10-23', '2026-10-22', 'en')).toBe('Tomorrow')
    expect(dayLabel('2026-10-25', '2026-10-22', 'en')).toMatch(/Sunday/)
  })

  it('capitalizes the slot', () => {
    expect(typeLabel('lunch')).toBe('Lunch')
  })
})
