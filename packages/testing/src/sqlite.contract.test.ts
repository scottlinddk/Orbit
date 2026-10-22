import { createSqliteRepositories } from './fixtures.ts'
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

const create = async () => createSqliteRepositories()
describeRepositoryContracts('sqlite', create)
describeAccountContracts('sqlite', create)
describeSessionContracts('sqlite', create)
describeInvitationContracts('sqlite', create)
describeFeedContracts('sqlite', create)
describeListContracts('sqlite', create)
describeCalendarSourceContracts('sqlite', create)
describeNotificationContracts('sqlite', create)
describeIdentityContracts('sqlite', create)
