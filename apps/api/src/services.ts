import type { PlanetRuntime } from '@orbit/module-planets/server'
import {
  createAuth,
  createCalendarService,
  createFeedReader,
  createUseCases,
  type Auth,
  type CalendarFeedReader,
  type CalendarService,
  type Clock,
  type FeedReader,
  type IdGenerator,
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
  /** IANA zone that decides what "today" means in the display feed. Defaults to UTC. */
  timeZone?: string | undefined
  oidc?: OidcProvider | undefined
  /** False when ORBIT_LOCAL_LOGIN=disabled. */
  localLoginEnabled?: boolean | undefined
}

/** Wires the application layer to concrete adapters. The only place that does so. */
export function assembleServices(parts: ServiceParts): Services {
  const { repos, hasher, tokens, clock, ids, registrationPolicy, setupGate, planets, oidc } = parts
  const calendar = createCalendarService({
    sources: repos.calendarSources,
    households: repos.households,
    clock,
    ids,
    ...parts.calendar,
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
    planets,
    oidc,
  }
}
