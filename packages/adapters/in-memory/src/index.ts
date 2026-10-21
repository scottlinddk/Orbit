import type {
  AccountRepository,
  Clock,
  Credential,
  DashboardRepository,
  HouseholdRepository,
  IdGenerator,
  InvitationRepository,
  PasswordHasher,
  RegistrationOutcome,
  RegistrationPolicy,
  Session,
  SessionStore,
  SessionTokens,
  UserRepository,
} from '@orbit/application'
import type {
  Dashboard,
  DashboardId,
  Household,
  HouseholdId,
  Invitation,
  InvitationId,
  User,
  UserId,
  Username,
} from '@orbit/domain'

// Domain values are immutable, so storing and returning them directly is safe.

export class InMemoryUserRepository implements UserRepository {
  readonly #byId = new Map<UserId, User>()

  async get(id: UserId) {
    return this.#byId.get(id)
  }

  async save(user: User) {
    this.#byId.set(user.id, user)
  }
}

export class InMemoryHouseholdRepository implements HouseholdRepository {
  readonly #byId = new Map<HouseholdId, Household>()

  async get(id: HouseholdId) {
    return this.#byId.get(id)
  }

  async save(household: Household) {
    this.#byId.set(household.id, household)
  }

  async listForUser(userId: UserId) {
    return [...this.#byId.values()].filter((h) => h.members.some((m) => m.userId === userId))
  }
}

export class InMemoryDashboardRepository implements DashboardRepository {
  readonly #byId = new Map<DashboardId, Dashboard>()

  async get(id: DashboardId) {
    return this.#byId.get(id)
  }

  async save(dashboard: Dashboard) {
    this.#byId.set(dashboard.id, dashboard)
  }

  async listForHousehold(householdId: HouseholdId) {
    return [...this.#byId.values()].filter((d) => d.householdId === householdId)
  }

  async delete(id: DashboardId) {
    this.#byId.delete(id)
  }
}

export class InMemoryInvitationRepository implements InvitationRepository {
  readonly #byId = new Map<InvitationId, Invitation>()

  async create(invitation: Invitation) {
    for (const existing of this.#byId.values())
      if (existing.id === invitation.id || existing.tokenHash === invitation.tokenHash)
        throw new Error('Duplicate invitation')
    this.#byId.set(invitation.id, invitation)
  }

  async get(id: InvitationId) {
    return this.#byId.get(id)
  }

  async findByTokenHash(tokenHash: string) {
    return [...this.#byId.values()].find((i) => i.tokenHash === tokenHash)
  }

  async listForHousehold(householdId: HouseholdId) {
    return [...this.#byId.values()].filter((i) => i.householdId === householdId)
  }

  // Check and change happen in the same tick, with no await between them.
  async claim(id: InvitationId, userId: UserId, now: Date) {
    const i = this.#byId.get(id)
    if (!i || i.acceptedAt || i.revokedAt || i.expiresAt.getTime() <= now.getTime()) return false
    this.#byId.set(id, { ...i, acceptedBy: userId, acceptedAt: now })
    return true
  }

  async release(id: InvitationId, userId: UserId) {
    const i = this.#byId.get(id)
    if (!i || i.acceptedBy !== userId) return
    // A claim is only possible on an invitation that was never revoked, so nothing else to keep.
    this.#byId.set(id, {
      id: i.id,
      householdId: i.householdId,
      role: i.role,
      tokenHash: i.tokenHash,
      createdBy: i.createdBy,
      createdAt: i.createdAt,
      expiresAt: i.expiresAt,
    })
  }

  async revoke(id: InvitationId, now: Date) {
    const i = this.#byId.get(id)
    if (!i || i.acceptedAt || i.revokedAt) return false
    this.#byId.set(id, { ...i, revokedAt: now })
    return true
  }
}

/** Deterministic ids for tests. Production uses an unguessable generator. */
export class CounterIdGenerator implements IdGenerator {
  #n = 0

  next() {
    this.#n += 1
    return `id-${this.#n}`
  }
}

export class InMemoryAccountRepository implements AccountRepository {
  readonly #users: InMemoryUserRepository
  readonly #byUsername = new Map<Username, Credential>()

  constructor(users: InMemoryUserRepository) {
    this.#users = users
  }

  async register(
    user: User,
    credential: Credential,
    policy: RegistrationPolicy,
  ): Promise<RegistrationOutcome> {
    if (policy === 'first-user-only' && this.#byUsername.size > 0) return 'registration-closed'
    if (this.#byUsername.has(credential.username)) return 'username-taken'
    // Claim the username in the same tick as the check. An await in between would let a
    // concurrent registration slip through.
    this.#byUsername.set(credential.username, credential)
    await this.#users.save(user)
    return 'created'
  }

  async findCredential(username: Username) {
    return this.#byUsername.get(username)
  }

  async setPasswordHash(userId: UserId, passwordHash: string) {
    for (const [username, credential] of this.#byUsername) {
      if (credential.userId === userId) {
        this.#byUsername.set(username, { ...credential, passwordHash })
        return true
      }
    }
    return false
  }
}

export class InMemorySessionStore implements SessionStore {
  readonly #byHash = new Map<string, Session>()

  async create(session: Session) {
    this.#byHash.set(session.tokenHash, session)
  }

  async get(tokenHash: string) {
    return this.#byHash.get(tokenHash)
  }

  async delete(tokenHash: string) {
    this.#byHash.delete(tokenHash)
  }

  async deleteForUser(userId: UserId) {
    let removed = 0
    for (const [hash, session] of this.#byHash) {
      if (session.userId === userId) {
        this.#byHash.delete(hash)
        removed += 1
      }
    }
    return removed
  }

  async deleteExpired(now: Date) {
    let removed = 0
    for (const [hash, session] of this.#byHash) {
      if (session.expiresAt.getTime() <= now.getTime()) {
        this.#byHash.delete(hash)
        removed += 1
      }
    }
    return removed
  }
}

/**
 * Fast and predictable, and therefore NOT secure: it stores the password in readable form.
 * For tests only. Production uses the Argon2 hasher from the identity adapter.
 */
export class InsecureTestPasswordHasher implements PasswordHasher {
  async hash(password: string) {
    return `insecure-test:${password}`
  }

  async verify(encodedHash: string, password: string) {
    return encodedHash === `insecure-test:${password}`
  }
}

/** Predictable tokens for tests. Production uses random 256-bit tokens. */
export class SequentialSessionTokens implements SessionTokens {
  #n = 0

  generate() {
    this.#n += 1
    const token = `token-${this.#n}`
    return { token, tokenHash: this.hash(token) }
  }

  hash(token: string) {
    return `hash(${token})`
  }
}

/** A clock that only moves when told to. */
export class ManualClock implements Clock {
  #now: Date

  constructor(start: Date = new Date('2026-01-01T00:00:00.000Z')) {
    this.#now = start
  }

  now() {
    return this.#now
  }

  advance(ms: number) {
    this.#now = new Date(this.#now.getTime() + ms)
  }
}
