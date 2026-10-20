import { createUseCases, type Actor, type UseCases } from '@orbit/application'
import {
  CounterIdGenerator,
  InMemoryDashboardRepository,
  InMemoryHouseholdRepository,
  InMemoryUserRepository,
} from '@orbit/adapter-in-memory'
import { UserId, createUser } from '@orbit/domain'

export interface TestSystem {
  useCases: UseCases
  /** Registers a user and returns the actor that user would log in as. */
  newActor(name: string): Promise<Actor>
}

/** The platform wired with in-memory adapters. */
export function createInMemorySystem(): TestSystem {
  const users = new InMemoryUserRepository()
  const useCases = createUseCases({
    users,
    households: new InMemoryHouseholdRepository(),
    dashboards: new InMemoryDashboardRepository(),
    ids: new CounterIdGenerator(),
  })
  return {
    useCases,
    async newActor(name) {
      const id = UserId(`user-${name}`)
      await users.save(createUser({ id, displayName: name }))
      return { userId: id }
    },
  }
}
