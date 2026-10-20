import type { User, UserId, Username } from '@orbit/domain'

export interface Credential {
  readonly userId: UserId
  readonly username: Username
  /** Encoded by the PasswordHasher, including salt and parameters. */
  readonly passwordHash: string
}

export type RegistrationPolicy = 'first-user-only' | 'open'
export type RegistrationOutcome = 'created' | 'username-taken' | 'registration-closed'

/** The user and their credential are created together or not at all. */
export interface AccountRepository {
  /**
   * Atomically checks the policy and the username, then stores both records.
   * With 'first-user-only' the answer is 'registration-closed' as soon as any account
   * exists, whatever username was requested, so a closed instance reveals no usernames.
   */
  register(
    user: User,
    credential: Credential,
    policy: RegistrationPolicy,
  ): Promise<RegistrationOutcome>
  findCredential(username: Username): Promise<Credential | undefined>
}

export interface Session {
  /** Hash of the token the browser holds. The token itself is never stored. */
  readonly tokenHash: string
  readonly userId: UserId
  readonly createdAt: Date
  readonly expiresAt: Date
}

export interface SessionStore {
  create(session: Session): Promise<void>
  get(tokenHash: string): Promise<Session | undefined>
  delete(tokenHash: string): Promise<void>
  deleteExpired(now: Date): Promise<number>
}

export interface PasswordHasher {
  hash(password: string): Promise<string>
  verify(encodedHash: string, password: string): Promise<boolean>
}

export interface SessionTokens {
  /** A new unguessable token and the hash to store for it. */
  generate(): { token: string; tokenHash: string }
  hash(token: string): string
}

export interface Clock {
  now(): Date
}
