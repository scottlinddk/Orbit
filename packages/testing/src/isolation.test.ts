import { createInMemorySystem, createSqliteSystem } from './fixtures.ts'
import { describeHouseholdIsolation } from './isolation-kit.ts'

describeHouseholdIsolation('in-memory', createInMemorySystem)
describeHouseholdIsolation('sqlite', createSqliteSystem)
