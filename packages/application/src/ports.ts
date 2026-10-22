import type { AccountRepository, SessionStore } from './auth-ports.ts'
import type {
  CalendarEvent,
  CalendarSource,
  CalendarSourceId,
  Dashboard,
  DashboardId,
  Feed,
  FeedId,
  Household,
  HouseholdId,
  HouseholdList,
  HouseholdListItem,
  Invitation,
  InvitationId,
  ListId,
  ListItemId,
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

export interface ListRepository {
  createList(list: HouseholdList): Promise<void>
  getList(id: ListId): Promise<HouseholdList | undefined>
  /** Saves a change to the list itself (its name). Items are untouched. */
  saveList(list: HouseholdList): Promise<void>
  /** Oldest first. */
  listsForHousehold(householdId: HouseholdId): Promise<HouseholdList[]>
  /** Removes the list and all its items. */
  deleteList(id: ListId): Promise<void>
  /** In position order. */
  items(listId: ListId): Promise<HouseholdListItem[]>
  getItem(id: ListItemId): Promise<HouseholdListItem | undefined>
  /** Inserts or replaces the items, all or none. */
  saveItems(items: readonly HouseholdListItem[]): Promise<void>
  deleteItem(id: ListItemId): Promise<void>
  /** Removes the ticked-off items of a list and says how many there were. */
  deleteCompleted(listId: ListId): Promise<number>
}

export interface CalendarSourceRepository {
  create(source: CalendarSource): Promise<void>
  get(id: CalendarSourceId): Promise<CalendarSource | undefined>
  /** Every source of a household, oldest first. */
  listForHousehold(householdId: HouseholdId): Promise<CalendarSource[]>
  delete(id: CalendarSourceId): Promise<void>
}

/**
 * Reads the events of one ICS feed. The address is a secret, so implementations must never put
 * it in an error message: failures are `CalendarFeedError` or `EgressDeniedError` with text
 * that is safe to show.
 */
export interface CalendarFeedReader {
  /**
   * Checks an address a person typed (`webcal://` included) and returns the URL to fetch and
   * its host. Throws `InvariantViolation` with a message fit for the owner.
   */
  parseAddress(input: string): { url: string; host: string }
  read(url: string, range: { from: Date; to: Date }): Promise<CalendarEvent[]>
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
  lists: ListRepository
  calendarSources: CalendarSourceRepository
}
