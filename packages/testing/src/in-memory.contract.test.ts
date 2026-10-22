import { createInMemoryRepositories } from './fixtures.ts'
import {
  describeAccountContracts,
  describeCalendarSourceContracts,
  describeFeedContracts,
  describeIdentityContracts,
  describeInvitationContracts,
  describeListContracts,
  describeNotificationContracts,
  describeRepositoryContracts,
  describeSessionContracts,
} from './repository-contracts.ts'

const create = async () => createInMemoryRepositories()
describeRepositoryContracts('in-memory', create)
describeAccountContracts('in-memory', create)
describeSessionContracts('in-memory', create)
describeInvitationContracts('in-memory', create)
describeFeedContracts('in-memory', create)
describeListContracts('in-memory', create)
describeCalendarSourceContracts('in-memory', create)
describeNotificationContracts('in-memory', create)
describeIdentityContracts('in-memory', create)
