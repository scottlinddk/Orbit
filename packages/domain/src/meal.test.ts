import { describe, expect, it } from 'vitest'
import {
  FEED_MEALS_LIMIT,
  FEED_STOCK_LIMIT,
  isPlainDate,
  mealsToday,
  normalizeMealType,
  renderFeed,
  stockExpiring,
  type MealPlanEntry,
  type StockItem,
} from './index.ts'
import { createFeed } from './feed.ts'
import type { Household } from './household.ts'
import type { FeedId, HouseholdId, UserId } from './ids.ts'

const entry = (over: Partial<MealPlanEntry> & { id: string }): MealPlanEntry => ({
  date: '2026-10-22',
  type: 'dinner',
  title: 'Soup',
  ...over,
})

describe('meals', () => {
  it('normalizes unknown slots to dinner', () => {
    expect(normalizeMealType('Lunch')).toBe('lunch')
    expect(normalizeMealType('brunch')).toBe('dinner')
    expect(normalizeMealType(undefined)).toBe('dinner')
  })

  it('checks plain dates', () => {
    expect(isPlainDate('2026-10-22')).toBe(true)
    expect(isPlainDate('2026-13-40')).toBe(false)
    expect(isPlainDate('22/10/2026')).toBe(false)
  })

  it("shows only today's meals, in the order of a day, titles only", () => {
    const glance = mealsToday(
      [
        entry({ id: '1', type: 'dinner', title: 'Pasta' }),
        entry({ id: '2', type: 'breakfast', title: 'Oats', note: 'private note' }),
        entry({ id: '3', date: '2026-10-23', title: 'Tomorrow' }),
      ],
      '2026-10-22',
    )
    expect(glance).toEqual([
      { type: 'breakfast', title: 'Oats' },
      { type: 'dinner', title: 'Pasta' },
    ])
  })

  it('caps what a feed shows', () => {
    const many = Array.from({ length: 50 }, (_, i) => entry({ id: `${i}`, title: `Meal ${i}` }))
    expect(mealsToday(many, '2026-10-22')).toHaveLength(FEED_MEALS_LIMIT)
  })
})

describe('stock', () => {
  const item = (over: Partial<StockItem> & { id: string }): StockItem => ({
    name: 'Milk',
    status: 'due-soon',
    amount: 1,
    ...over,
  })

  it('puts the most urgent first and leaves out ids and amounts', () => {
    const glance = stockExpiring([
      item({ id: '1', name: 'Yoghurt', status: 'due-soon', bestBefore: '2026-10-25' }),
      item({ id: '2', name: 'Eggs', status: 'missing', amount: 3 }),
      item({ id: '3', name: 'Cheese', status: 'expired', bestBefore: '2026-10-01' }),
    ])
    expect(glance).toEqual([
      { name: 'Cheese', status: 'expired', bestBefore: '2026-10-01' },
      { name: 'Yoghurt', status: 'due-soon', bestBefore: '2026-10-25' },
      { name: 'Eggs', status: 'missing' },
    ])
  })

  it('caps what a feed shows', () => {
    const many = Array.from({ length: 80 }, (_, i) => item({ id: `${i}`, name: `P${i}` }))
    expect(stockExpiring(many)).toHaveLength(FEED_STOCK_LIMIT)
  })
})

describe('feed fields for meals and stock', () => {
  const household = { id: 'h1', name: 'Home', members: [] } as unknown as Household
  const feed = createFeed({
    id: 'f1' as FeedId,
    householdId: 'h1' as HouseholdId,
    name: 'Kitchen',
    fields: ['meals.today', 'stock.expiring'],
    tokenHash: 'x',
    createdBy: 'u1' as UserId,
    now: new Date('2026-10-22T08:00:00Z'),
  })

  it('publishes empty lists when nothing is connected', () => {
    expect(renderFeed(feed, { household, dashboard: undefined })).toEqual({
      meals: { today: [] },
      stock: { expiring: [] },
    })
  })

  it('publishes only titles and statuses', () => {
    const out = renderFeed(feed, {
      household,
      dashboard: undefined,
      meals: {
        today: '2026-10-22',
        entries: [entry({ id: '1', note: 'secret', recipe: { ref: 'abc', name: 'Soup' } })],
      },
      stock: {
        items: [{ id: '9', name: 'Milk', status: 'expired', amount: 2, bestBefore: '2026-10-01' }],
      },
    })
    expect(out).toEqual({
      meals: { today: [{ type: 'dinner', title: 'Soup' }] },
      stock: { expiring: [{ name: 'Milk', status: 'expired', bestBefore: '2026-10-01' }] },
    })
  })
})
