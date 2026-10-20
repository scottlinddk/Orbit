import {
  InvariantViolation,
  UserId,
  Username,
  createUser,
  invariant,
  type User,
} from '@orbit/domain'
import type { Actor } from './actor.ts'
import type {
  AccountRepository,
  Clock,
  PasswordHasher,
  RegistrationPolicy,
  SessionStore,
  SessionTokens,
} from './auth-ports.ts'
import type { IdGenerator } from './ports.ts'

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

export const MIN_PASSWORD_LENGTH = 12
/** Upper bound so a huge password cannot be used to burn hashing time. */
export const MAX_PASSWORD_LENGTH = 128
export const DEFAULT_SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000

export interface AuthDependencies {
  accounts: AccountRepository
  sessions: SessionStore
  hasher: PasswordHasher
  tokens: SessionTokens
  clock: Clock
  ids: IdGenerator
  registrationPolicy: RegistrationPolicy
  sessionTtlMs?: number
}

export interface LoginResult {
  /** The raw token, handed to the browser once and never stored. */
  token: string
  expiresAt: Date
  userId: UserId
}

export type Auth = ReturnType<typeof createAuth>

export function createAuth(deps: AuthDependencies) {
  const { accounts, sessions, hasher, tokens, clock, ids } = deps
  const ttl = deps.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS

  // Verifying against a real hash for unknown usernames keeps the response time the same,
  // so timing does not reveal which usernames exist.
  let decoy: Promise<string> | undefined
  const decoyHash = () => (decoy ??= hasher.hash('decoy-password-for-timing'))

  return {
    async register(input: {
      username: string
      password: string
      displayName?: string | undefined
    }): Promise<User> {
      const username = Username(input.username)
      invariant(
        input.password.length >= MIN_PASSWORD_LENGTH &&
          input.password.length <= MAX_PASSWORD_LENGTH,
        `Password must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters`,
      )
      invariant(
        input.password.toLowerCase() !== username,
        'Password must not be the same as the username',
      )
      const userId = UserId(ids.next())
      const user = createUser({ id: userId, displayName: input.displayName?.trim() || username })
      const passwordHash = await hasher.hash(input.password)
      const outcome = await accounts.register(
        user,
        { userId, username, passwordHash },
        deps.registrationPolicy,
      )
      if (outcome === 'registration-closed') throw new RegistrationClosedError()
      if (outcome === 'username-taken') throw new UsernameTakenError()
      return user
    },

    async login(input: { username: string; password: string }): Promise<LoginResult> {
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

      const { token, tokenHash } = tokens.generate()
      const createdAt = clock.now()
      const expiresAt = new Date(createdAt.getTime() + ttl)
      await sessions.create({ tokenHash, userId: credential.userId, createdAt, expiresAt })
      return { token, expiresAt, userId: credential.userId }
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

    /** For a periodic housekeeping job. */
    purgeExpiredSessions(): Promise<number> {
      return sessions.deleteExpired(clock.now())
    },
  }
}
