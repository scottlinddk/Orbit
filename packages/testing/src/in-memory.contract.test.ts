import {
  InMemoryDashboardRepository,
  InMemoryHouseholdRepository,
  InMemoryUserRepository,
} from '@orbit/adapter-in-memory'
import { describeRepositoryContracts } from './repository-contracts.ts'

describeRepositoryContracts('in-memory', async () => ({
  users: new InMemoryUserRepository(),
  households: new InMemoryHouseholdRepository(),
  dashboards: new InMemoryDashboardRepository(),
}))
