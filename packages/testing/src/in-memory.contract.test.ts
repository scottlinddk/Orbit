import { createInMemoryRepositories } from './fixtures.ts'
import {
  describeAccountContracts,
  describeCalendarSourceContracts,
  describeFeedContracts,
  describeInvitationContracts,
  describeRepositoryContracts,
  describeSessionContracts,
} from './repository-contracts.ts'

const create = async () => createInMemoryRepositories()
describeRepositoryContracts('in-memory', create)
describeAccountContracts('in-memory', create)
describeSessionContracts('in-memory', create)
describeInvitationContracts('in-memory', create)
describeFeedContracts('in-memory', create)
describeCalendarSourceContracts('in-memory', create)
