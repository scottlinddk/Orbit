import type { HouseholdRole } from './household.ts'

export type HouseholdAction =
  | 'household:view'
  | 'household:view-members'
  | 'household:manage-members'
  | 'dashboard:view'
  | 'dashboard:create'
  | 'dashboard:edit'
  | 'dashboard:delete'
  | 'calendar:view'
  | 'list:view'
  | 'list:edit'
  | 'feed:manage'
  | 'calendar:manage'
  | 'connection:manage'

/**
 * Deny by default: an action is allowed only when listed for the role.
 * Four fixed roles on purpose. A role editor is out of scope for the MVP (ADR 0007).
 *
 * - owner: everything.
 * - member: sees everything, edits lists, cannot change the household or its dashboards.
 * - child: like a member for lists and the calendar, but cannot see who else is in the household.
 * - device: a shared screen. It shows dashboards, calendar and lists, and nothing else.
 *   It can read the household name so the app can find its dashboards, but not the member list.
 */
const grants: Record<HouseholdRole, ReadonlySet<HouseholdAction>> = {
  owner: new Set<HouseholdAction>([
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
    'calendar:manage',
    'connection:manage',
  ]),
  member: new Set<HouseholdAction>([
    'household:view',
    'household:view-members',
    'dashboard:view',
    'calendar:view',
    'list:view',
    'list:edit',
  ]),
  child: new Set<HouseholdAction>([
    'household:view',
    'dashboard:view',
    'calendar:view',
    'list:view',
    'list:edit',
  ]),
  device: new Set<HouseholdAction>([
    'household:view',
    'dashboard:view',
    'calendar:view',
    'list:view',
  ]),
}

export function can(role: HouseholdRole, action: HouseholdAction): boolean {
  return grants[role].has(action)
}
