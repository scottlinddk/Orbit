import { InsecureTestPasswordHasher, SequentialSessionTokens } from '@orbit/adapter-in-memory'
import {
  NotFoundError,
  UsernameTakenError,
  createAuth,
  type Actor,
  type Auth,
  type HouseholdRepository,
} from '@orbit/application'
import {
  DEFAULT_INVITATION_TTL_DAYS,
  HouseholdId,
  InvariantViolation,
  InvitationId,
  Username,
  roleOf,
} from '@orbit/domain'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createInMemoryRepositories,
  createSqliteRepositories,
  createSystem,
  type TestSystem,
} from './fixtures.ts'
import type { RepositorySet } from './repository-contracts.ts'

const PASSWORD = 'correct horse battery'
const DAY = 24 * 60 * 60 * 1000

describe.each([
  ['in-memory', createInMemoryRepositories],
  ['sqlite', createSqliteRepositories],
])('invitations: %s', (_name, makeRepos) => {
  let repos: RepositorySet
  let sys: TestSystem
  let auth: Auth
  let alice: Actor
  let household: HouseholdId

  beforeEach(async () => {
    repos = makeRepos()
    sys = createSystem(repos)
    let n = 0
    auth = createAuth({
      accounts: repos.accounts,
      sessions: repos.sessions,
      hasher: new InsecureTestPasswordHasher(),
      tokens: new SequentialSessionTokens(),
      clock: sys.clock,
      ids: { next: () => `auth-${++n}` },
      invitations: repos.invitations,
      households: repos.households,
      // Registration is closed, which is the default on a real instance.
      registrationPolicy: 'first-user-only',
    })
    alice = await sys.newActor('alice')
    household = (await sys.useCases.createHousehold(alice, { name: 'Home' })).id
  })

  const invite = (input: Parameters<TestSystem['useCases']['createInvitation']>[2] = {}) =>
    sys.useCases.createInvitation(alice, household, input)
  const accept = (token: string, username = 'bobby', extra: { password?: string } = {}) =>
    auth.acceptInvitation({ token, username, password: extra.password ?? PASSWORD })

  it('lets an invitee join with their own username and password, while registration is closed', async () => {
    const { token } = await invite()
    const user = await accept(token)

    expect(roleOf((await sys.useCases.getHousehold(alice, household))!, user.id)).toBe('member')
    const login = await auth.login({ username: 'bobby', password: PASSWORD })
    expect(login.userId).toBe(user.id)
    await expect(auth.register({ username: 'carol', password: PASSWORD })).rejects.toThrow()
  })

  it('gives the role the owner chose', async () => {
    const { token } = await invite({ role: 'child' })
    const user = await accept(token)
    expect(roleOf((await sys.useCases.getHousehold(alice, household))!, user.id)).toBe('child')
  })

  it('shows the household and role to someone holding the link', async () => {
    const { token } = await invite({ role: 'member' })
    expect(await auth.previewInvitation(token)).toEqual({ householdName: 'Home', role: 'member' })
  })

  it('never stores the token, only its hash', async () => {
    const { token, invitation } = await invite()
    expect(invitation.tokenHash).not.toBe(token)
    expect(await repos.invitations.findByTokenHash(token)).toBeUndefined()
    expect(await repos.invitations.get(invitation.id)).toEqual(invitation)
  })

  it('is single use', async () => {
    const { token } = await invite()
    await accept(token, 'bobby')
    await expect(accept(token, 'carol')).rejects.toBeInstanceOf(NotFoundError)
    await expect(auth.previewInvitation(token)).rejects.toBeInstanceOf(NotFoundError)
    expect(await repos.accounts.findCredential(Username('carol'))).toBeUndefined()
  })

  it('lets only one of two simultaneous uses of the same link in', async () => {
    const { token } = await invite()
    const results = await Promise.allSettled([accept(token, 'bobby'), accept(token, 'carol')])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const members = (await sys.useCases.getHousehold(alice, household)).members
    expect(members).toHaveLength(2)
  })

  it('expires after seven days by default, to the millisecond', async () => {
    const { token } = await invite()
    sys.clock.advance(DEFAULT_INVITATION_TTL_DAYS * DAY - 1)
    await expect(auth.previewInvitation(token)).resolves.toBeDefined()
    sys.clock.advance(1)
    await expect(auth.previewInvitation(token)).rejects.toBeInstanceOf(NotFoundError)
    await expect(accept(token)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('honours a shorter lifetime and rejects an absurd one', async () => {
    const { token } = await invite({ expiresInDays: 1 })
    sys.clock.advance(DAY)
    await expect(accept(token)).rejects.toBeInstanceOf(NotFoundError)
    await expect(invite({ expiresInDays: 365 })).rejects.toBeInstanceOf(InvariantViolation)
  })

  it('stops working once revoked', async () => {
    const { token, invitation } = await invite()
    await sys.useCases.revokeInvitation(alice, household, invitation.id)
    await expect(accept(token)).rejects.toBeInstanceOf(NotFoundError)
    expect(await sys.useCases.listInvitations(alice, household)).toEqual([])
  })

  it('refuses to revoke an invitation that was already used or revoked', async () => {
    const used = await invite()
    await accept(used.token)
    await expect(
      sys.useCases.revokeInvitation(alice, household, used.invitation.id),
    ).rejects.toBeInstanceOf(InvariantViolation)

    const revoked = await invite()
    await sys.useCases.revokeInvitation(alice, household, revoked.invitation.id)
    await expect(
      sys.useCases.revokeInvitation(alice, household, revoked.invitation.id),
    ).rejects.toBeInstanceOf(InvariantViolation)
  })

  it('lists only invitations that can still be used', async () => {
    const used = await invite()
    const revoked = await invite()
    const expired = await invite({ expiresInDays: 1 })
    const open = await invite({ expiresInDays: 10 })
    await accept(used.token)
    await sys.useCases.revokeInvitation(alice, household, revoked.invitation.id)
    sys.clock.advance(2 * DAY)
    const listed = await sys.useCases.listInvitations(alice, household)
    expect(listed.map((i) => i.id)).toEqual([open.invitation.id])
    expect(listed.map((i) => i.id)).not.toContain(expired.invitation.id)
  })

  it('answers an unknown token like an expired one', async () => {
    const unknown = await auth.previewInvitation('made-up').catch((e) => e)
    const { token } = await invite({ expiresInDays: 1 })
    sys.clock.advance(DAY)
    const expired = await auth.previewInvitation(token).catch((e) => e)
    expect(unknown).toBeInstanceOf(NotFoundError)
    expect(expired.constructor).toBe(unknown.constructor)
    expect(expired.message).toBe(unknown.message)
  })

  describe('when the new account cannot be created', () => {
    it('keeps the link usable after a taken username, so the invitee can pick another', async () => {
      const { token } = await invite()
      await expect(accept(token, 'alice')).rejects.toBeInstanceOf(UsernameTakenError)
      const user = await accept(token, 'bobby')
      expect(roleOf((await sys.useCases.getHousehold(alice, household))!, user.id)).toBe('member')
    })

    it('does not use the link up on a weak password or a malformed username', async () => {
      const { token } = await invite()
      await expect(accept(token, 'bobby', { password: 'short' })).rejects.toBeInstanceOf(
        InvariantViolation,
      )
      await expect(accept(token, '??')).rejects.toBeInstanceOf(InvariantViolation)
      await expect(accept(token, 'bobby')).resolves.toBeDefined()
    })

    it('hands the link back when joining fails after the claim', async () => {
      const { token, invitation } = await invite()
      const broken: HouseholdRepository = {
        get: (id) => repos.households.get(id),
        listForUser: (userId) => repos.households.listForUser(userId),
        save: async () => {
          throw new Error('disk full')
        },
      }
      let n = 0
      const flaky = createAuth({
        accounts: repos.accounts,
        sessions: repos.sessions,
        hasher: new InsecureTestPasswordHasher(),
        tokens: new SequentialSessionTokens(),
        clock: sys.clock,
        ids: { next: () => `flaky-${++n}` },
        invitations: repos.invitations,
        households: broken,
        registrationPolicy: 'first-user-only',
      })
      await expect(
        flaky.acceptInvitation({ token, username: 'bobby', password: PASSWORD }),
      ).rejects.toThrow('disk full')
      const stored = await repos.invitations.get(invitation.id)
      expect(stored?.acceptedAt).toBeUndefined()
      expect(await sys.useCases.listInvitations(alice, household)).toHaveLength(1)
    })
  })

  it('does not let a member who is not an owner create, list or revoke invitations', async () => {
    const bob = await sys.newActor('bobby2')
    await sys.useCases.addHouseholdMember(alice, household, { userId: bob.userId })
    const { invitation } = await invite()
    await expect(sys.useCases.createInvitation(bob, household, {})).rejects.toThrow(/Not allowed/)
    await expect(sys.useCases.listInvitations(bob, household)).rejects.toThrow(/Not allowed/)
    await expect(sys.useCases.revokeInvitation(bob, household, invitation.id)).rejects.toThrow(
      /Not allowed/,
    )
  })

  it('knows nothing of invitations for a household that does not exist', async () => {
    await expect(
      sys.useCases.createInvitation(alice, HouseholdId('nope'), {}),
    ).rejects.toBeInstanceOf(NotFoundError)
    await expect(
      sys.useCases.revokeInvitation(alice, household, InvitationId('nope')),
    ).rejects.toBeInstanceOf(NotFoundError)
  })
})
