import {
  CounterIdGenerator,
  InMemoryAccountRepository,
  InMemoryDashboardRepository,
  InMemoryHouseholdRepository,
  InMemorySessionStore,
  InMemoryUserRepository,
} from '@orbit/adapter-in-memory'
import {
  SqliteAccountRepository,
  SqliteDashboardRepository,
  SqliteHouseholdRepository,
  SqliteSessionStore,
  SqliteUserRepository,
  migrate,
  openDatabase,
} from '@orbit/adapter-persistence-sqlite'
import { createUseCases, type Actor, type UseCases } from '@orbit/application'
import { UserId, Username, createUser } from '@orbit/domain'
import type { RepositorySet } from './repository-contracts.ts'

export interface TestSystem {
  useCases: UseCases
  /** Registers a user and returns the actor that user would log in as. */
  newActor(name: string): Promise<Actor>
}

/** The platform wired with the given repositories. */
export function createSystem(repos: RepositorySet): TestSystem {
  const useCases = createUseCases({ ...repos, ids: new CounterIdGenerator() })
  return {
    useCases,
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
    dashboards: new SqliteDashboardRepository(db),
  }
}

export const createInMemorySystem = () => createSystem(createInMemoryRepositories())
export const createSqliteSystem = () => createSystem(createSqliteRepositories())
