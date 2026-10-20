import type { DashboardResponse, HouseholdResponse, SessionUser } from '@orbit/contracts'

export const ME: SessionUser = { id: 'u-me', displayName: 'Scott' }

export const household = (overrides: Partial<HouseholdResponse> = {}): HouseholdResponse => ({
  id: 'h1',
  name: 'Home',
  members: [{ userId: ME.id, role: 'owner' }],
  ...overrides,
})

export const memberOnlyHousehold = (): HouseholdResponse =>
  household({
    members: [
      { userId: 'u-owner', role: 'owner' },
      { userId: ME.id, role: 'member' },
    ],
  })

export const dashboard = (overrides: Partial<DashboardResponse> = {}): DashboardResponse => ({
  id: 'd1',
  householdId: 'h1',
  name: 'Week',
  columns: 3,
  widgets: [],
  ...overrides,
})

export const widget = (id: string, type: string, span = 1) => ({ id, type, span, config: {} })
