import {
  CounterIdGenerator,
  ManualClock,
  SequentialSessionTokens,
  InMemoryAccountRepository,
  InMemoryCalendarSourceRepository,
  InMemoryDashboardRepository,
  InMemoryExternalIdentityRepository,
  InMemoryFeedRepository,
  InMemoryHouseholdRepository,
  InMemoryDeliveryLogRepository,
  InMemoryInvitationRepository,
  InMemoryJobScheduler,
  InMemoryListRepository,
  InMemoryNotificationDedupeRepository,
  InMemoryNotificationEndpointRepository,
  InMemorySecretStore,
  InMemorySessionStore,
  InMemoryUserRepository,
} from '@orbit/adapter-in-memory'
import {
  SqliteAccountRepository,
  SqliteCalendarSourceRepository,
  SqliteDashboardRepository,
  SqliteExternalIdentityRepository,
  SqliteFeedRepository,
  SqliteHouseholdRepository,
  SqliteDeliveryLogRepository,
  SqliteInvitationRepository,
  SqliteListRepository,
  SqliteNotificationDedupeRepository,
  SqliteNotificationEndpointRepository,
  SqliteSessionStore,
  SqliteUserRepository,
  migrate,
  openDatabase,
} from '@orbit/adapter-persistence-sqlite'
import {
  createCalendarService,
  createFeedReader,
  createNotificationService,
  createUseCases,
  type Actor,
  type CalendarService,
  type FeedReader,
  type NotificationService,
  type UseCases,
} from '@orbit/application'
import { UserId, Username, createUser } from '@orbit/domain'
import { FakeCalendarFeedReader } from './calendar-fakes.ts'
import { FakeNotificationPlatform, FakeWebhookFetcher } from './notification-fakes.ts'
import type { RepositorySet } from './repository-contracts.ts'

export interface TestSystem {
  /** The repositories behind everything, to build a second service over the same data. */
  repos: RepositorySet
  useCases: UseCases
  /** What a display with a feed token can do. */
  feedReader: FeedReader
  /** Household calendars, reading from `calendarReader` instead of the network. */
  calendar: CalendarService
  calendarReader: FakeCalendarFeedReader
  /** Outgoing webhooks, delivered to `webhooks` instead of the network. */
  notifications: NotificationService
  webhooks: FakeWebhookFetcher
  /** The queue behind `notifications`. */
  jobs: InMemoryJobScheduler
  /** Moves time forward for invitations and anything else that expires. */
  clock: ManualClock
  /** Registers a user and returns the actor that user would log in as. */
  newActor(name: string): Promise<Actor>
}

/** The platform wired with the given repositories. */
export function createSystem(
  repos: RepositorySet,
  options: { maxFeedBytes?: number; timeZone?: string; notificationRateLimit?: number } = {},
): TestSystem {
  const clock = new ManualClock()
  const tokens = new SequentialSessionTokens()
  const ids = new CounterIdGenerator()
  const calendarReader = new FakeCalendarFeedReader()
  const calendar = createCalendarService({
    sources: repos.calendarSources,
    households: repos.households,
    secrets: new InMemorySecretStore(),
    reader: calendarReader,
    clock,
    ids,
  })
  const webhooks = new FakeWebhookFetcher()
  const jobs = new InMemoryJobScheduler()
  const notifications = createNotificationService({
    endpoints: repos.notificationEndpoints,
    log: repos.deliveryLog,
    dedupe: repos.notificationDedupe,
    households: repos.households,
    secrets: new InMemorySecretStore(),
    fetcher: webhooks,
    jobs,
    platform: new FakeNotificationPlatform(),
    calendar,
    clock,
    ids,
    ...(options.notificationRateLimit === undefined
      ? {}
      : { rateLimitPerMinute: options.notificationRateLimit }),
  })
  const { timeZone, notificationRateLimit: _rate, ...useCaseOptions } = options
  const useCases = createUseCases({
    ...repos,
    tokens,
    clock,
    ids,
    events: notifications.sink,
    ...useCaseOptions,
  })
  return {
    repos,
    useCases,
    feedReader: createFeedReader({
      ...repos,
      tokens,
      clock,
      calendar,
      timeZone,
      ...(options.maxFeedBytes === undefined ? {} : { maxFeedBytes: options.maxFeedBytes }),
    }),
    calendar,
    calendarReader,
    notifications,
    webhooks,
    jobs,
    clock,
    async newActor(name) {
      const id = UserId(`user-${name}`)
      const outcome = await repos.accounts.register(
        createUser({ id, displayName: name }),
        { userId: id, username: Username(name), passwordHash: 'not-a-real-hash' },
        'open',
      )
      if (outcome !== 'created') throw new Error(`Could not create test user ${name}: ${outcome}`)
      return { userId: id }
    },
  }
}

export function createInMemoryRepositories(): RepositorySet {
  const users = new InMemoryUserRepository()
  return {
    users,
    accounts: new InMemoryAccountRepository(users),
    sessions: new InMemorySessionStore(),
    households: new InMemoryHouseholdRepository(),
    invitations: new InMemoryInvitationRepository(),
    identities: new InMemoryExternalIdentityRepository(users),
    feeds: new InMemoryFeedRepository(),
    lists: new InMemoryListRepository(),
    calendarSources: new InMemoryCalendarSourceRepository(),
    notificationEndpoints: new InMemoryNotificationEndpointRepository(),
    deliveryLog: new InMemoryDeliveryLogRepository(),
    notificationDedupe: new InMemoryNotificationDedupeRepository(),
    dashboards: new InMemoryDashboardRepository(),
  }
}

/** A fresh, migrated, in-memory SQLite database wrapped in the SQLite repositories. */
export function createSqliteRepositories(): RepositorySet {
  const db = openDatabase(':memory:')
  migrate(db)
  return {
    users: new SqliteUserRepository(db),
    accounts: new SqliteAccountRepository(db),
    sessions: new SqliteSessionStore(db),
    households: new SqliteHouseholdRepository(db),
    invitations: new SqliteInvitationRepository(db),
    identities: new SqliteExternalIdentityRepository(db),
    feeds: new SqliteFeedRepository(db),
    lists: new SqliteListRepository(db),
    calendarSources: new SqliteCalendarSourceRepository(db),
    notificationEndpoints: new SqliteNotificationEndpointRepository(db),
    deliveryLog: new SqliteDeliveryLogRepository(db),
    notificationDedupe: new SqliteNotificationDedupeRepository(db),
    dashboards: new SqliteDashboardRepository(db),
  }
}

export const createInMemorySystem = () => createSystem(createInMemoryRepositories())
export const createSqliteSystem = () => createSystem(createSqliteRepositories())
