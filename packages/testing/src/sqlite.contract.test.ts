import { createSqliteRepositories } from './fixtures.ts'
import {
  describeAccountContracts,
  describeFeedContracts,
  describeInvitationContracts,
  describeRepositoryContracts,
  describeSessionContracts,
} from './repository-contracts.ts'

const create = async () => createSqliteRepositories()
describeRepositoryContracts('sqlite', create)
describeAccountContracts('sqlite', create)
describeSessionContracts('sqlite', create)
describeInvitationContracts('sqlite', create)
describeFeedContracts('sqlite', create)
