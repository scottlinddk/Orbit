import { createSqliteRepositories } from './fixtures.ts'
import { describeRepositoryContracts } from './repository-contracts.ts'

describeRepositoryContracts('sqlite', async () => createSqliteRepositories())
