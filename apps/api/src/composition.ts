import { randomUUID } from 'node:crypto'
import { createGuardedFetcher } from '@orbit/adapter-egress-guard'
import { SqliteJobScheduler } from '@orbit/adapter-jobs-sqlite'
import { Argon2PasswordHasher, RandomSessionTokens } from '@orbit/adapter-identity-local'
import {
  SqliteAccountRepository,
  SqliteCalendarSourceRepository,
  SqliteDashboardRepository,
  SqliteDeliveryLogRepository,
  SqliteExternalIdentityRepository,
  SqliteFeedRepository,
  SqliteHouseholdRepository,
  SqliteInvitationRepository,
  SqliteListRepository,
  SqliteNotificationDedupeRepository,
  SqliteNotificationEndpointRepository,
  SqliteSessionStore,
  SqliteUserRepository,
  type Database,
} from '@orbit/adapter-persistence-sqlite'
import type { OidcProvider, SetupGate } from '@orbit/application'
import type { PlanetRuntime } from '@orbit/module-planets/server'
import { createCalendarWiring } from './calendar.ts'
import { createNodeNotificationPlatform } from './notification-platform.ts'
import type { Config } from './config.ts'
import { assembleServices, type Services } from './services.ts'

/** The production wiring: SQLite, Argon2id, random session tokens, the system clock. */
export function createSqliteServices(
  db: Database,
  config: Pick<Config, 'registration'> &
    Partial<Pick<Config, 'secretKey' | 'egressAllowPrivateHosts' | 'timeZone' | 'localLogin'>>,
  setupGate?: SetupGate,
  planets?: PlanetRuntime,
  oidc?: OidcProvider,
): Services {
  return assembleServices({
    repos: {
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
    },
    hasher: new Argon2PasswordHasher(),
    tokens: new RandomSessionTokens(),
    clock: { now: () => new Date() },
    ids: { next: () => randomUUID() },
    registrationPolicy: config.registration,
    setupGate,
    planets,
    calendar: createCalendarWiring(db, config),
    notifications: {
      fetcher: createGuardedFetcher({
        allowPrivateHosts: config.egressAllowPrivateHosts ?? new Set(),
      }),
      jobs: new SqliteJobScheduler(db),
      platform: createNodeNotificationPlatform(),
    },
    timeZone: config.timeZone,
    oidc,
    localLoginEnabled: config.localLogin ?? true,
  })
}
