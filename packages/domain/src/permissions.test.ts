import { describe, expect, it } from 'vitest'
import { HOUSEHOLD_ROLES, can, type HouseholdAction, type HouseholdRole } from './index.ts'

const all: HouseholdAction[] = [
  'household:view',
  'household:view-members',
  'household:manage-members',
  'dashboard:view',
  'dashboard:create',
  'dashboard:edit',
  'dashboard:delete',
  'calendar:view',
  'list:view',
  'list:edit',
  'feed:manage',
]

const allowed = (role: HouseholdRole) => all.filter((a) => can(role, a))

describe('permissions', () => {
  it('lets owners do everything', () => {
    expect(allowed('owner')).toEqual(all)
  })

  it('lets members view everything and edit lists, but not manage anything', () => {
    expect(allowed('member')).toEqual([
      'household:view',
      'household:view-members',
      'dashboard:view',
      'calendar:view',
      'list:view',
      'list:edit',
    ])
  })

  it('keeps the member list from children', () => {
    expect(allowed('child')).toEqual([
      'household:view',
      'dashboard:view',
      'calendar:view',
      'list:view',
      'list:edit',
    ])
  })

  it('lets a device only show things', () => {
    expect(allowed('device')).toEqual([
      'household:view',
      'dashboard:view',
      'calendar:view',
      'list:view',
    ])
  })

  it('only owners can manage members, change dashboards or publish feeds', () => {
    const ownerOnly: HouseholdAction[] = [
      'household:manage-members',
      'dashboard:create',
      'dashboard:edit',
      'dashboard:delete',
      'feed:manage',
    ]
    for (const role of HOUSEHOLD_ROLES.filter((r) => r !== 'owner')) {
      for (const action of ownerOnly) expect(can(role, action)).toBe(false)
    }
  })
})
