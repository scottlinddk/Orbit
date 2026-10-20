import { createInMemoryRepositories } from './fixtures.ts'
import {
  describeAccountContracts,
  describeRepositoryContracts,
  describeSessionContracts,
} from './repository-contracts.ts'

const create = async () => createInMemoryRepositories()
describeRepositoryContracts('in-memory', create)
describeAccountContracts('in-memory', create)
describeSessionContracts('in-memory', create)
