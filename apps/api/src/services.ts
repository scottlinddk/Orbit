import type { PlanetRuntime } from '@orbit/module-planets/server'
import {
  createAuth,
  createCalendarService,
  createConnectionService,
  createFeedReader,
  createNotificationService,
  createUseCases,
  type Auth,
  type CalendarFeedReader,
  type CalendarService,
  type Clock,
  type ConnectionService,
  type FeedReader,
  type EgressFetcher,
  type IdGenerator,
  type IntegrationProvider,
  type JobScheduler,
  type NotificationPlatform,
  type NotificationService,
  type OidcProvider,
  type PasswordHasher,
  type Repositories,
  type RegistrationPolicy,
  type SecretStore,
  type SessionTokens,
  type SetupGate,
  type UseCases,
} from '@orbit/application'

export interface Services {
  useCases: UseCases
  auth: Auth
  feedReader: FeedReader
  calendar: CalendarService
  /** Other systems (Home Assistant) whose calendars and lists are mirrored. */
  connections: ConnectionService
  /** Outgoing webhooks (ADR 0020). */
  notifications: NotificationService
  /** Present when Planets are wired. Without it the Planet routes answer empty or 404. */
  planets?: PlanetRuntime | undefined
  /** Present when ORBIT_OIDC_* is configured. */
  oidc?: OidcProvider | undefined
}

export interface ServiceParts {
  repos: Repositories
  hasher: PasswordHasher
  tokens: SessionTokens
  clock: Clock
  ids: IdGenerator
  registrationPolicy: RegistrationPolicy
  setupGate?: SetupGate | undefined
  planets?: PlanetRuntime | undefined
  /** Where household calendars keep their secret addresses and how they read feeds. */
  calendar: { secrets: SecretStore; reader: CalendarFeedReader; ttlMs?: number }
  /**
   * Which systems can be connected. Their addresses and tokens are kept in the same secret store
   * as calendar addresses. Without a provider nothing can be connected.
   */
  connections?: {
    providers: readonly IntegrationProvider[]
    calendarTtlMs?: number
    listTtlMs?: number
  }
  /** Delivers notifications: the egress guard, the durable queue and the platform helpers. */
  notifications: {
    fetcher: EgressFetcher
    jobs: JobScheduler
    platform: NotificationPlatform
    rateLimitPerMinute?: number
  }
  /** IANA zone that decides what "today" means in the display feed. Defaults to UTC. */
  timeZone?: string | undefined
  oidc?: OidcProvider | undefined
  /** False when ORBIT_LOCAL_LOGIN=disabled. */
  localLoginEnabled?: boolean | undefined
}

/** Wires the application layer to concrete adapters. The only place that does so. */
export function assembleServices(parts: ServiceParts): Services {
  const { repos, hasher, tokens, clock, ids, registrationPolicy, setupGate, planets, oidc } = parts
  const connections = createConnectionService({
    connections: repos.connections,
    households: repos.households,
    secrets: parts.calendar.secrets,
    providers: parts.connections?.providers ?? [],
    clock,
    ids,
    calendarTtlMs: parts.connections?.calendarTtlMs,
    listTtlMs: parts.connections?.listTtlMs,
  })
  const calendar = createCalendarService({
    sources: repos.calendarSources,
    households: repos.households,
    clock,
    ids,
    ...parts.calendar,
    external: connections.calendars,
  })
  const notifications = createNotificationService({
    endpoints: repos.notificationEndpoints,
    log: repos.deliveryLog,
    dedupe: repos.notificationDedupe,
    households: repos.households,
    secrets: parts.calendar.secrets,
    calendar,
    clock,
    ids,
    ...parts.notifications,
  })
  return {
    useCases: createUseCases({
      users: repos.users,
      accounts: repos.accounts,
      households: repos.households,
      dashboards: repos.dashboards,
      invitations: repos.invitations,
      feeds: repos.feeds,
      lists: repos.lists,
      externalLists: connections.lists,
      events: notifications.sink,
      tokens,
      clock,
      ids,
    }),
    feedReader: createFeedReader({
      feeds: repos.feeds,
      households: repos.households,
      dashboards: repos.dashboards,
      lists: repos.lists,
      tokens,
      calendar,
      clock,
      timeZone: parts.timeZone,
    }),
    auth: createAuth({
      accounts: repos.accounts,
      sessions: repos.sessions,
      hasher,
      tokens,
      clock,
      ids,
      invitations: repos.invitations,
      households: repos.households,
      identities: repos.identities,
      localLoginEnabled: parts.localLoginEnabled,
      registrationPolicy,
      setupGate,
    }),
    calendar,
    connections,
    notifications,
    planets,
    oidc,
  }
}
