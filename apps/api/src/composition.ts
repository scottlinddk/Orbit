import { randomUUID } from 'node:crypto'
import { Argon2PasswordHasher, RandomSessionTokens } from '@orbit/adapter-identity-local'
import {
  SqliteAccountRepository,
  SqliteDashboardRepository,
  SqliteExternalIdentityRepository,
  SqliteFeedRepository,
  SqliteHouseholdRepository,
  SqliteInvitationRepository,
  SqliteSessionStore,
  SqliteUserRepository,
  type Database,
} from '@orbit/adapter-persistence-sqlite'
import type { OidcProvider, SetupGate } from '@orbit/application'
import type { PlanetRuntime } from '@orbit/module-planets/server'
import type { Config } from './config.ts'
import { assembleServices, type Services } from './services.ts'

/** The production wiring: SQLite, Argon2id, random session tokens, the system clock. */
export function createSqliteServices(
  db: Database,
  config: Pick<Config, 'registration'> & Partial<Pick<Config, 'localLogin'>>,
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
      dashboards: new SqliteDashboardRepository(db),
    },
    hasher: new Argon2PasswordHasher(),
    tokens: new RandomSessionTokens(),
    clock: { now: () => new Date() },
    ids: { next: () => randomUUID() },
    registrationPolicy: config.registration,
    setupGate,
    planets,
    oidc,
    localLoginEnabled: config.localLogin ?? true,
  })
}
