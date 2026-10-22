import { describe, expect, it } from 'vitest'
import {
  DashboardId,
  FEED_FIELDS,
  FeedId,
  HouseholdId,
  InvariantViolation,
  UserId,
  addWidget,
  createDashboard,
  createFeed,
  createHousehold,
  feedByteLength,
  isActiveFeed,
  renderFeed,
  WidgetPlacementId,
  type FeedField,
} from './index.ts'

const base = {
  id: FeedId('f1'),
  householdId: HouseholdId('h1'),
  name: 'Kitchen',
  tokenHash: 'hash',
  createdBy: UserId('alice'),
  now: new Date('2026-01-01T00:00:00Z'),
}
const household = createHousehold({ id: HouseholdId('h1'), name: 'Home', ownerId: UserId('alice') })
const dashboard = addWidget(
  createDashboard({ id: DashboardId('d1'), householdId: HouseholdId('h1'), name: 'Wall' }),
  {
    id: WidgetPlacementId('w1'),
    type: 'calendar.agenda',
    span: 2,
    config: { calendarSecret: 'do-not-leak' },
  },
)

describe('createFeed', () => {
  it('needs a name and at least one known field', () => {
    expect(() => createFeed({ ...base, name: ' ', fields: ['household.name'] })).toThrow(
      InvariantViolation,
    )
    expect(() => createFeed({ ...base, fields: [] })).toThrow(InvariantViolation)
    expect(() => createFeed({ ...base, fields: ['whole.household' as FeedField] })).toThrow(
      /Unknown/,
    )
  })

  it('needs a dashboard exactly when a dashboard field is chosen', () => {
    expect(() => createFeed({ ...base, fields: ['dashboard.name'] })).toThrow(/dashboard/)
    const f = createFeed({ ...base, fields: ['household.name'], dashboardId: DashboardId('d1') })
    expect(f.dashboardId).toBeUndefined()
  })

  it('drops duplicate fields', () => {
    const f = createFeed({ ...base, fields: ['household.name', 'household.name'] })
    expect(f.fields).toEqual(['household.name'])
  })

  it('registers only fields that cannot carry widget configuration', () => {
    expect(FEED_FIELDS.some((f) => f.includes('config'))).toBe(false)
  })
})

describe('renderFeed', () => {
  const dashboardId = DashboardId('d1')

  it('publishes exactly the chosen fields', () => {
    const only = createFeed({ ...base, fields: ['household.name'] })
    expect(renderFeed(only, { household, dashboard })).toEqual({ household: { name: 'Home' } })
    const some = createFeed({ ...base, fields: ['dashboard.name'], dashboardId })
    expect(renderFeed(some, { household, dashboard })).toEqual({ dashboard: { name: 'Wall' } })
  })

  it('shows widget type and span, never configuration', () => {
    const f = createFeed({ ...base, fields: ['dashboard.widgets'], dashboardId })
    const out = renderFeed(f, { household, dashboard })
    expect(out).toEqual({ dashboard: { widgets: [{ type: 'calendar.agenda', span: 2 }] } })
    expect(JSON.stringify(out)).not.toContain('do-not-leak')
  })

  it('says null when the dashboard is gone', () => {
    const f = createFeed({ ...base, fields: ['dashboard.name'], dashboardId })
    expect(renderFeed(f, { household, dashboard: undefined })).toEqual({ dashboard: null })
  })
})

describe('feedByteLength', () => {
  it('counts UTF-8 bytes, not characters', () => {
    expect(feedByteLength({ a: 'abc' })).toBe(JSON.stringify({ a: 'abc' }).length)
    expect(feedByteLength({ a: 'æ€😀' })).toBe(JSON.stringify({ a: '' }).length + 2 + 3 + 4)
  })
})

it('treats a feed as active until it is revoked', () => {
  const f = createFeed({ ...base, fields: ['household.name'] })
  expect(isActiveFeed(f)).toBe(true)
  expect(isActiveFeed({ ...f, revokedAt: new Date() })).toBe(false)
})
