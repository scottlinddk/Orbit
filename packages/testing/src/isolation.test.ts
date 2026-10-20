import { createInMemorySystem } from './fixtures.ts'
import { describeHouseholdIsolation } from './isolation-kit.ts'

describeHouseholdIsolation('in-memory', createInMemorySystem)
