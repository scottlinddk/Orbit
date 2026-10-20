import { createSqliteRepositories } from './fixtures.ts'
import {
  describeAccountContracts,
  describeRepositoryContracts,
  describeSessionContracts,
} from './repository-contracts.ts'

const create = async () => createSqliteRepositories()
describeRepositoryContracts('sqlite', create)
describeAccountContracts('sqlite', create)
describeSessionContracts('sqlite', create)
