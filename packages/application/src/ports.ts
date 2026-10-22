import type { AccountRepository, SessionStore } from './auth-ports.ts'
import type {
  Dashboard,
  DashboardId,
  Feed,
  FeedId,
  Household,
  HouseholdId,
  Invitation,
  InvitationId,
  User,
  UserId,
} from '@orbit/domain'

/** Implementations must return and store independent values, never shared mutable state. */
export interface UserRepository {
  get(id: UserId): Promise<User | undefined>
  save(user: User): Promise<void>
}

export interface HouseholdRepository {
  get(id: HouseholdId): Promise<Household | undefined>
  save(household: Household): Promise<void>
  listForUser(userId: UserId): Promise<Household[]>
}

export interface DashboardRepository {
  get(id: DashboardId): Promise<Dashboard | undefined>
  save(dashboard: Dashboard): Promise<void>
  listForHousehold(householdId: HouseholdId): Promise<Dashboard[]>
  delete(id: DashboardId): Promise<void>
}

export interface InvitationRepository {
  /** Stores a new invitation. Ids and token hashes are unique. */
  create(invitation: Invitation): Promise<void>
  get(id: InvitationId): Promise<Invitation | undefined>
  findByTokenHash(tokenHash: string): Promise<Invitation | undefined>
  /** Every invitation of a household, accepted and revoked ones included, oldest first. */
  listForHousehold(householdId: HouseholdId): Promise<Invitation[]>
  /**
   * Single use, decided atomically: marks the invitation accepted by `userId` only if it is
   * still pending at `now`, and says whether this call won. Of two simultaneous claims,
   * exactly one returns true.
   */
  claim(id: InvitationId, userId: UserId, now: Date): Promise<boolean>
  /** Undoes a claim by `userId` when joining failed afterwards, so the owner need not start over. */
  release(id: InvitationId, userId: UserId): Promise<void>
  /** Revokes an invitation that is not yet accepted or revoked. False when it no longer was. */
  revoke(id: InvitationId, now: Date): Promise<boolean>
}

export interface FeedRepository {
  /** Stores a new feed. Ids and token hashes are unique. */
  create(feed: Feed): Promise<void>
  get(id: FeedId): Promise<Feed | undefined>
  findByTokenHash(tokenHash: string): Promise<Feed | undefined>
  /** Every feed of a household, revoked ones included, oldest first. */
  listForHousehold(householdId: HouseholdId): Promise<Feed[]>
  /** Revokes a feed that is not yet revoked. False when it already was. */
  revoke(id: FeedId, now: Date): Promise<boolean>
}

/** Produces unguessable, unique ids. The domain never generates ids itself. */
export interface IdGenerator {
  next(): string
}

/** Every persistence port, for adapters that implement them together and for the composition root. */
export interface Repositories {
  users: UserRepository
  accounts: AccountRepository
  sessions: SessionStore
  households: HouseholdRepository
  invitations: InvitationRepository
  dashboards: DashboardRepository
  feeds: FeedRepository
}
