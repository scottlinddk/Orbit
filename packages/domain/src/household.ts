import { invariant } from './errors.ts'
import type { HouseholdId, UserId } from './ids.ts'

export const HOUSEHOLD_ROLES = ['owner', 'member', 'child', 'device'] as const
export type HouseholdRole = (typeof HOUSEHOLD_ROLES)[number]

/** Roles an owner can hand out through an invitation. There is exactly one way to become an owner: create the household. */
export const INVITABLE_ROLES = [
  'member',
  'child',
  'device',
] as const satisfies readonly HouseholdRole[]
export type InvitableRole = (typeof INVITABLE_ROLES)[number]

export interface Membership {
  readonly userId: UserId
  readonly role: HouseholdRole
}

export interface Household {
  readonly id: HouseholdId
  readonly name: string
  readonly members: readonly Membership[]
}

function validName(name: string): string {
  const trimmed = name.trim()
  invariant(trimmed.length > 0 && trimmed.length <= 80, 'Household name must be 1 to 80 characters')
  return trimmed
}

export function createHousehold(input: {
  id: HouseholdId
  name: string
  ownerId: UserId
}): Household {
  return {
    id: input.id,
    name: validName(input.name),
    members: [{ userId: input.ownerId, role: 'owner' }],
  }
}

export function roleOf(household: Household, userId: UserId): HouseholdRole | undefined {
  return household.members.find((m) => m.userId === userId)?.role
}

export function addMember(
  household: Household,
  userId: UserId,
  role: HouseholdRole = 'member',
): Household {
  invariant(roleOf(household, userId) === undefined, 'User is already a member of this household')
  return { ...household, members: [...household.members, { userId, role }] }
}

export function removeMember(household: Household, userId: UserId): Household {
  const role = roleOf(household, userId)
  invariant(role !== undefined, 'User is not a member of this household')
  const remaining = household.members.filter((m) => m.userId !== userId)
  invariant(
    remaining.some((m) => m.role === 'owner'),
    'A household must keep at least one owner',
  )
  return { ...household, members: remaining }
}

/**
 * Changes a member's role. The last owner cannot be demoted, because a household without an
 * owner could never be managed again.
 */
export function changeMemberRole(
  household: Household,
  userId: UserId,
  role: HouseholdRole,
): Household {
  const current = roleOf(household, userId)
  invariant(current !== undefined, 'User is not a member of this household')
  const members = household.members.map((m) => (m.userId === userId ? { ...m, role } : m))
  invariant(
    members.some((m) => m.role === 'owner'),
    'A household must keep at least one owner',
  )
  return { ...household, members }
}
