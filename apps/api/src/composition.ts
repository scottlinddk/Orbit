import { randomUUID } from 'node:crypto'
import { Argon2PasswordHasher, RandomSessionTokens } from '@orbit/adapter-identity-local'
import {
  SqliteAccountRepository,
  SqliteDashboardRepository,
  SqliteFeedRepository,
  SqliteHouseholdRepository,
  SqliteInvitationRepository,
  SqliteListRepository,
  SqliteSessionStore,
  SqliteUserRepository,
  type Database,
} from '@orbit/adapter-persistence-sqlite'
import type { SetupGate } from '@orbit/application'
import type { PlanetRuntime } from '@orbit/module-planets/server'
import type { Config } from './config.ts'
import { assembleServices, type Services } from './services.ts'

/** The production wiring: SQLite, Argon2id, random session tokens, the system clock. */
export function createSqliteServices(
  db: Database,
  config: Pick<Config, 'registration'>,
  setupGate?: SetupGate,
  planets?: PlanetRuntime,
): Services {
  return assembleServices({
    repos: {
      users: new SqliteUserRepository(db),
      accounts: new SqliteAccountRepository(db),
      sessions: new SqliteSessionStore(db),
      households: new SqliteHouseholdRepository(db),
      invitations: new SqliteInvitationRepository(db),
      feeds: new SqliteFeedRepository(db),
      lists: new SqliteListRepository(db),
      dashboards: new SqliteDashboardRepository(db),
    },
    hasher: new Argon2PasswordHasher(),
    tokens: new RandomSessionTokens(),
    clock: { now: () => new Date() },
    ids: { next: () => randomUUID() },
    registrationPolicy: config.registration,
    setupGate,
    planets,
  })
}
