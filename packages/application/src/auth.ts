import {
  InvariantViolation,
  UserId,
  createExternalIdentity,
  Username,
  addMember,
  createUser,
  invariant,
  isRedeemable,
  type HouseholdRole,
  type User,
} from '@orbit/domain'
import type { Actor } from './actor.ts'
import { NotFoundError } from './errors.ts'
import type {
  AccountRepository,
  Clock,
  PasswordHasher,
  RegistrationPolicy,
  SessionStore,
  SessionTokens,
  SetupGate,
} from './auth-ports.ts'
import type { OidcIdentity } from './oidc.ts'
import type {
  ExternalIdentityRepository,
  HouseholdRepository,
  IdGenerator,
  InvitationRepository,
} from './ports.ts'

/** Deliberately vague: never say whether the username or the password was wrong. */
export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid username or password')
    this.name = 'InvalidCredentialsError'
  }
}

export class UsernameTakenError extends Error {
  constructor() {
    super('That username is taken')
    this.name = 'UsernameTakenError'
  }
}

export class RegistrationClosedError extends Error {
  constructor() {
    super('Registration is closed on this instance')
    this.name = 'RegistrationClosedError'
  }
}

export class SetupCodeInvalidError extends Error {
  constructor() {
    super('The setup code is missing or wrong. Find it in the server log.')
    this.name = 'SetupCodeInvalidError'
  }
}

/** Password sign-in and sign-up are switched off (ORBIT_LOCAL_LOGIN=disabled). */
export class LocalLoginDisabledError extends Error {
  constructor() {
    super('Signing in with a password is turned off on this instance')
    this.name = 'LocalLoginDisabledError'
  }
}

/** The identity at the provider belongs to another account, or this account has one already. */
export class OidcIdentityTakenError extends Error {
  constructor() {
    super('That identity provider account is already linked to a different Orbit account')
    this.name = 'OidcIdentityTakenError'
  }
}

export const MIN_PASSWORD_LENGTH = 12
/** Upper bound so a huge password cannot be used to burn hashing time. */
export const MAX_PASSWORD_LENGTH = 128
export const DEFAULT_SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000

export function assertPasswordPolicy(password: string, username: Username): void {
  invariant(
    password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH,
    `Password must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters`,
  )
  invariant(password.toLowerCase() !== username, 'Password must not be the same as the username')
}

export interface AuthDependencies {
  accounts: AccountRepository
  sessions: SessionStore
  hasher: PasswordHasher
  tokens: SessionTokens
  clock: Clock
  ids: IdGenerator
  invitations: InvitationRepository
  households: HouseholdRepository
  /** Needed for OIDC sign-in. */
  identities?: ExternalIdentityRepository | undefined
  /** False when ORBIT_LOCAL_LOGIN=disabled. Defaults to true. */
  localLoginEnabled?: boolean | undefined
  registrationPolicy: RegistrationPolicy
  /** Present only on an instance that has no owner yet. */
  setupGate?: SetupGate | undefined
  sessionTtlMs?: number
}

export interface LoginResult {
  /** The raw token, handed to the browser once and never stored. */
  token: string
  expiresAt: Date
  userId: UserId
}

/**
 * What an OIDC callback asks for. `inviteToken`, `setupCode` and `linkUserId` come from the signed
 * state the sign-in started with, never from the callback URL.
 */
export interface OidcSignIn {
  identity: OidcIdentity
  inviteToken?: string | undefined
  setupCode?: string | undefined
  /** Set when a signed-in user asked to link this identity. */
  linkUserId?: UserId | undefined
}

export type OidcSignInResult =
  { kind: 'signed-in'; login: LoginResult } | { kind: 'linked'; userId: UserId }

const DEFAULT_OIDC_NAME = 'Orbit user'

export type Auth = ReturnType<typeof createAuth>

export function createAuth(deps: AuthDependencies) {
  const { accounts, sessions, hasher, tokens, clock, ids, invitations, households } = deps
  const ttl = deps.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS
  const localLoginEnabled = deps.localLoginEnabled ?? true
  const requireLocalLogin = () => {
    if (!localLoginEnabled) throw new LocalLoginDisabledError()
  }

  async function startSession(userId: UserId): Promise<LoginResult> {
    const { token, tokenHash } = tokens.generate()
    const createdAt = clock.now()
    const expiresAt = new Date(createdAt.getTime() + ttl)
    await sessions.create({ tokenHash, userId, createdAt, expiresAt })
    return { token, expiresAt, userId }
  }

  // Verifying against a real hash for unknown usernames keeps the response time the same,
  // so timing does not reveal which usernames exist.
  let decoy: Promise<string> | undefined
  const decoyHash = () => (decoy ??= hasher.hash('decoy-password-for-timing'))

  /**
   * Unknown, expired, revoked and used tokens all look the same (NotFoundError), so a caller
   * learns nothing beyond "this link does not work".
   */
  async function redeemable(token: string) {
    const invitation = await invitations.findByTokenHash(tokens.hash(token))
    if (!invitation || !isRedeemable(invitation, clock.now())) throw new NotFoundError()
    return invitation
  }

  return {
    async register(input: {
      username: string
      password: string
      displayName?: string | undefined
      setupCode?: string | undefined
    }): Promise<User> {
      requireLocalLogin()
      // Checked before anything else, and before the slow password hash, so a wrong guess is cheap.
      const gate = deps.setupGate
      if (gate?.isOpen() && !gate.accepts(input.setupCode)) throw new SetupCodeInvalidError()
      const username = Username(input.username)
      assertPasswordPolicy(input.password, username)
      const userId = UserId(ids.next())
      const user = createUser({ id: userId, displayName: input.displayName?.trim() || username })
      const passwordHash = await hasher.hash(input.password)
      const outcome = await accounts.register(
        user,
        { userId, username, passwordHash },
        deps.registrationPolicy,
      )
      // Either way an owner exists now (or already did), so the code has done its job.
      if (outcome !== 'username-taken') gate?.close()
      if (outcome === 'registration-closed') throw new RegistrationClosedError()
      if (outcome === 'username-taken') throw new UsernameTakenError()
      return user
    },

    /** Whether the first registration needs a setup code. Safe to show to anyone. */
    setupCodeRequired(): boolean {
      return deps.setupGate?.isOpen() ?? false
    },

    async login(input: { username: string; password: string }): Promise<LoginResult> {
      requireLocalLogin()
      let username: Username
      try {
        username = Username(input.username)
      } catch (error) {
        if (!(error instanceof InvariantViolation)) throw error
        // A malformed username cannot exist. Spend the same time, then answer the same way.
        await hasher.verify(await decoyHash(), input.password.slice(0, MAX_PASSWORD_LENGTH))
        throw new InvalidCredentialsError()
      }
      const credential = await accounts.findCredential(username)
      const candidate = input.password.slice(0, MAX_PASSWORD_LENGTH)
      const ok = await hasher.verify(credential?.passwordHash ?? (await decoyHash()), candidate)
      if (!credential || !ok) throw new InvalidCredentialsError()
      return startSession(credential.userId)
    },

    /** Whether password sign-in is on. Safe to show to anyone. */
    localLoginEnabled(): boolean {
      return localLoginEnabled
    },

    /**
     * Completes an OIDC sign-in with the identity the provider vouched for. A known identity signs
     * in its user. An unknown one is linked when a signed-in user asked for that, and otherwise
     * creates a new user only when an invitation, open registration or the setup code of a new
     * instance allows it (ADR 0018). It never matches on email or username.
     */
    async signInWithIdentity(input: OidcSignIn): Promise<OidcSignInResult> {
      if (!deps.identities) throw new Error('OIDC sign-in is not wired')
      const identities = deps.identities
      const { issuer, subject } = input.identity
      const existing = await identities.find(issuer, subject)

      if (input.linkUserId) {
        if (existing) {
          if (existing.userId !== input.linkUserId) throw new OidcIdentityTakenError()
          return { kind: 'linked', userId: existing.userId }
        }
        const link = createExternalIdentity({
          issuer,
          subject,
          userId: input.linkUserId,
          now: clock.now(),
        })
        if ((await identities.link(link)) === 'conflict') throw new OidcIdentityTakenError()
        return { kind: 'linked', userId: input.linkUserId }
      }

      if (existing) return { kind: 'signed-in', login: await startSession(existing.userId) }

      // A new person. Work out what lets them in before creating anything.
      const gate = deps.setupGate
      let policy: RegistrationPolicy = 'open'
      let invitation: Awaited<ReturnType<typeof redeemable>> | undefined
      if (input.inviteToken) {
        invitation = await redeemable(input.inviteToken)
      } else if (deps.registrationPolicy === 'open') {
        policy = 'open'
      } else if (gate?.isOpen()) {
        if (!gate.accepts(input.setupCode)) throw new SetupCodeInvalidError()
        policy = 'first-user-only'
      } else {
        throw new RegistrationClosedError()
      }

      const userId = UserId(ids.next())
      const name = input.identity.displayName?.trim().slice(0, 80) || DEFAULT_OIDC_NAME
      const user = createUser({ id: userId, displayName: name })
      const identity = createExternalIdentity({ issuer, subject, userId, now: clock.now() })

      if (invitation) {
        if (!(await invitations.claim(invitation.id, userId, clock.now())))
          throw new NotFoundError()
        try {
          const outcome = await identities.createUser(user, identity, 'open')
          if (outcome !== 'created') throw new OidcIdentityTakenError()
          const household = await households.get(invitation.householdId)
          if (!household) throw new NotFoundError()
          await households.save(addMember(household, userId, invitation.role))
        } catch (error) {
          await invitations.release(invitation.id, userId)
          throw error
        }
        return { kind: 'signed-in', login: await startSession(userId) }
      }

      const outcome = await identities.createUser(user, identity, policy)
      if (outcome === 'registration-closed') {
        gate?.close()
        throw new RegistrationClosedError()
      }
      if (outcome === 'identity-exists') {
        // Two callbacks for the same new person raced. The other one won, so sign in as that user.
        const winner = await identities.find(issuer, subject)
        if (!winner) throw new OidcIdentityTakenError()
        return { kind: 'signed-in', login: await startSession(winner.userId) }
      }
      if (policy === 'first-user-only') gate?.close()
      return { kind: 'signed-in', login: await startSession(userId) }
    },

    /** Resolves a session token to the actor, or undefined for unknown and expired tokens. */
    async authenticate(token: string): Promise<Actor | undefined> {
      const tokenHash = tokens.hash(token)
      const session = await sessions.get(tokenHash)
      if (!session) return undefined
      if (session.expiresAt.getTime() <= clock.now().getTime()) {
        await sessions.delete(tokenHash)
        return undefined
      }
      return { userId: session.userId }
    },

    async logout(token: string): Promise<void> {
      await sessions.delete(tokens.hash(token))
    },

    /**
     * Operator action, run from the command line on the server, never over HTTP. Sets a new
     * password and signs the user out everywhere, because whoever caused the reset may have
     * had the old password or a session.
     */
    async resetPassword(input: { username: string; password: string }): Promise<void> {
      const username = Username(input.username)
      assertPasswordPolicy(input.password, username)
      const credential = await accounts.findCredential(username)
      if (!credential) throw new NotFoundError()
      await accounts.setPasswordHash(credential.userId, await hasher.hash(input.password))
      await sessions.deleteForUser(credential.userId)
    },

    /** What a valid invitation link offers, so the page can say what the invitee is joining. */
    async previewInvitation(
      token: string,
    ): Promise<{ householdName: string; role: HouseholdRole }> {
      const invitation = await redeemable(token)
      const household = await households.get(invitation.householdId)
      if (!household) throw new NotFoundError()
      return { householdName: household.name, role: invitation.role }
    },

    /**
     * Creates the invitee's account and adds it to the household, using up the invitation. It
     * works even while registration is closed: the owner's invitation is the permission. The
     * invitation is claimed before the account exists, so two people using the same link cannot
     * both get in. A failure after the claim hands the invitation back.
     */
    async acceptInvitation(input: {
      token: string
      username: string
      password: string
      displayName?: string | undefined
    }): Promise<User> {
      requireLocalLogin()
      const invitation = await redeemable(input.token)
      const username = Username(input.username)
      assertPasswordPolicy(input.password, username)
      const userId = UserId(ids.next())
      const user = createUser({ id: userId, displayName: input.displayName?.trim() || username })
      const passwordHash = await hasher.hash(input.password)

      if (!(await invitations.claim(invitation.id, userId, clock.now()))) throw new NotFoundError()
      try {
        const outcome = await accounts.register(user, { userId, username, passwordHash }, 'open')
        if (outcome !== 'created') throw new UsernameTakenError()
        const household = await households.get(invitation.householdId)
        if (!household) throw new NotFoundError()
        await households.save(addMember(household, userId, invitation.role))
      } catch (error) {
        await invitations.release(invitation.id, userId)
        throw error
      }
      return user
    },

    /** For a periodic housekeeping job. */
    purgeExpiredSessions(): Promise<number> {
      return sessions.deleteExpired(clock.now())
    },
  }
}
