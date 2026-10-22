import { describe, expect, it } from 'vitest'
import { can, type HouseholdAction } from './index.ts'

const all: HouseholdAction[] = [
  'household:view',
  'household:manage-members',
  'dashboard:view',
  'dashboard:create',
  'dashboard:edit',
  'dashboard:delete',
  'feed:manage',
]

describe('permissions', () => {
  it('lets owners do everything', () => {
    for (const action of all) expect(can('owner', action)).toBe(true)
  })

  it('lets members only view', () => {
    const allowed = all.filter((a) => can('member', a))
    expect(allowed).toEqual(['household:view', 'dashboard:view'])
  })
})
