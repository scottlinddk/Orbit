import { describe, expect, it } from 'vitest'
import { InvariantViolation } from './errors.ts'
import { HouseholdId, InvitationId, UserId } from './ids.ts'
import {
  DEFAULT_INVITATION_TTL_DAYS,
  createInvitation,
  invitationStatus,
  isRedeemable,
} from './invitation.ts'

const now = new Date('2026-01-01T00:00:00.000Z')
const make = (ttlDays?: number) =>
  createInvitation({
    id: InvitationId('i1'),
    householdId: HouseholdId('h1'),
    role: 'member',
    tokenHash: 'hash',
    createdBy: UserId('alice'),
    now,
    ttlDays,
  })

describe('invitation', () => {
  it('expires after seven days by default', () => {
    const invitation = make()
    expect(invitation.expiresAt.getTime() - now.getTime()).toBe(
      DEFAULT_INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000,
    )
    expect(invitationStatus(invitation, now)).toBe('pending')
  })

  it.each([0, -1, 31, 1.5, Number.NaN])('rejects a lifetime of %s days', (days) => {
    expect(() => make(days)).toThrow(InvariantViolation)
  })

  it('is pending until the exact expiry instant', () => {
    const invitation = make(1)
    const justBefore = new Date(invitation.expiresAt.getTime() - 1)
    expect(isRedeemable(invitation, justBefore)).toBe(true)
    expect(invitationStatus(invitation, invitation.expiresAt)).toBe('expired')
  })

  it('reports accepted and revoked even after the expiry has passed', () => {
    const later = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
    const accepted = { ...make(), acceptedAt: now, acceptedBy: UserId('bob') }
    const revoked = { ...make(), revokedAt: now }
    expect(invitationStatus(accepted, later)).toBe('accepted')
    expect(invitationStatus(revoked, later)).toBe('revoked')
    expect(isRedeemable(accepted, now)).toBe(false)
    expect(isRedeemable(revoked, now)).toBe(false)
  })
})
