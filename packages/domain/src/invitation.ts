import { invariant } from './errors.ts'
import type { HouseholdId, InvitationId, UserId } from './ids.ts'
import { INVITABLE_ROLES, type HouseholdRole } from './household.ts'

export const DEFAULT_INVITATION_TTL_DAYS = 7
export const MAX_INVITATION_TTL_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired'

/**
 * A one-time offer to join a household. The secret itself is never part of the domain: only
 * its hash is kept, so a leaked database cannot be used to join a household.
 */
export interface Invitation {
  readonly id: InvitationId
  readonly householdId: HouseholdId
  /** The role the new member gets. */
  readonly role: HouseholdRole
  readonly tokenHash: string
  readonly createdBy: UserId
  readonly createdAt: Date
  readonly expiresAt: Date
  readonly acceptedBy?: UserId
  readonly acceptedAt?: Date
  readonly revokedAt?: Date
}

export function createInvitation(input: {
  id: InvitationId
  householdId: HouseholdId
  role: HouseholdRole
  tokenHash: string
  createdBy: UserId
  now: Date
  ttlDays?: number | undefined
}): Invitation {
  invariant(
    (INVITABLE_ROLES as readonly HouseholdRole[]).includes(input.role),
    'An invitation cannot make someone an owner',
  )
  const ttlDays = input.ttlDays ?? DEFAULT_INVITATION_TTL_DAYS
  invariant(
    Number.isInteger(ttlDays) && ttlDays >= 1 && ttlDays <= MAX_INVITATION_TTL_DAYS,
    `An invitation must last 1 to ${MAX_INVITATION_TTL_DAYS} days`,
  )
  return {
    id: input.id,
    householdId: input.householdId,
    role: input.role,
    tokenHash: input.tokenHash,
    createdBy: input.createdBy,
    createdAt: input.now,
    expiresAt: new Date(input.now.getTime() + ttlDays * DAY_MS),
  }
}

/** Accepted and revoked win over expired, because they say what actually happened. */
export function invitationStatus(invitation: Invitation, now: Date): InvitationStatus {
  if (invitation.acceptedAt) return 'accepted'
  if (invitation.revokedAt) return 'revoked'
  if (invitation.expiresAt.getTime() <= now.getTime()) return 'expired'
  return 'pending'
}

/** Whether the secret can still be used to join. */
export const isRedeemable = (invitation: Invitation, now: Date) =>
  invitationStatus(invitation, now) === 'pending'
