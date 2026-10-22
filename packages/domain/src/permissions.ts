import type { HouseholdRole } from './household.ts'

export type HouseholdAction =
  | 'household:view'
  | 'household:manage-members'
  | 'dashboard:view'
  | 'dashboard:create'
  | 'dashboard:edit'
  | 'dashboard:delete'
  | 'feed:manage'

/**
 * Deny by default: an action is allowed only when listed for the role.
 * Two fixed roles on purpose. A role editor is out of scope for the MVP.
 */
const grants: Record<HouseholdRole, ReadonlySet<HouseholdAction>> = {
  owner: new Set<HouseholdAction>([
    'household:view',
    'household:manage-members',
    'dashboard:view',
    'dashboard:create',
    'dashboard:edit',
    'dashboard:delete',
    'feed:manage',
  ]),
  member: new Set<HouseholdAction>(['household:view', 'dashboard:view']),
}

export function can(role: HouseholdRole, action: HouseholdAction): boolean {
  return grants[role].has(action)
}
