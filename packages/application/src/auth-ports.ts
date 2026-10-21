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
  /** Replaces the stored hash. Returns false when the user has no credential. */
  setPasswordHash(userId: UserId, passwordHash: string): Promise<boolean>
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
  /** Ends every session of one user. Returns how many were removed. */
  deleteForUser(userId: UserId): Promise<number>
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

/**
 * Guards the very first registration on an instance that has no owner yet, so that whoever
 * reaches a freshly started server first cannot take it over. The operator reads the code from
 * the server log and types it into the first registration.
 */
export interface SetupGate {
  /** True while the first registration still needs the code. */
  isOpen(): boolean
  /** Whether `code` is the setup code. Compares in constant time. */
  accepts(code: string | undefined): boolean
  /** Discards the code for good. Called once an owner exists. */
  close(): void
}
