import {
  CounterIdGenerator,
  InMemoryDashboardRepository,
  InMemoryHouseholdRepository,
  InMemoryUserRepository,
} from '@orbit/adapter-in-memory'
import {
  SqliteDashboardRepository,
  SqliteHouseholdRepository,
  SqliteUserRepository,
  migrate,
  openDatabase,
} from '@orbit/adapter-persistence-sqlite'
import { createUseCases, type Actor, type UseCases } from '@orbit/application'
import { UserId, createUser } from '@orbit/domain'
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
      await repos.users.save(createUser({ id, displayName: name }))
      return { userId: id }
    },
  }
}

export function createInMemoryRepositories(): RepositorySet {
  return {
    users: new InMemoryUserRepository(),
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
    households: new SqliteHouseholdRepository(db),
    dashboards: new SqliteDashboardRepository(db),
  }
}

export const createInMemorySystem = () => createSystem(createInMemoryRepositories())
export const createSqliteSystem = () => createSystem(createSqliteRepositories())
