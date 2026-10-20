import { createInMemoryRepositories } from './fixtures.ts'
import { describeRepositoryContracts } from './repository-contracts.ts'

describeRepositoryContracts('in-memory', async () => createInMemoryRepositories())
