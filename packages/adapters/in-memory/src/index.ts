import type {
  DashboardRepository,
  HouseholdRepository,
  IdGenerator,
  UserRepository,
} from '@orbit/application'
import type { Dashboard, DashboardId, Household, HouseholdId, User, UserId } from '@orbit/domain'

// Domain values are immutable, so storing and returning them directly is safe.

export class InMemoryUserRepository implements UserRepository {
  readonly #byId = new Map<UserId, User>()

  async get(id: UserId) {
    return this.#byId.get(id)
  }

  async save(user: User) {
    this.#byId.set(user.id, user)
  }
}

export class InMemoryHouseholdRepository implements HouseholdRepository {
  readonly #byId = new Map<HouseholdId, Household>()

  async get(id: HouseholdId) {
    return this.#byId.get(id)
  }

  async save(household: Household) {
    this.#byId.set(household.id, household)
  }

  async listForUser(userId: UserId) {
    return [...this.#byId.values()].filter((h) => h.members.some((m) => m.userId === userId))
  }
}

export class InMemoryDashboardRepository implements DashboardRepository {
  readonly #byId = new Map<DashboardId, Dashboard>()

  async get(id: DashboardId) {
    return this.#byId.get(id)
  }

  async save(dashboard: Dashboard) {
    this.#byId.set(dashboard.id, dashboard)
  }

  async listForHousehold(householdId: HouseholdId) {
    return [...this.#byId.values()].filter((d) => d.householdId === householdId)
  }

  async delete(id: DashboardId) {
    this.#byId.delete(id)
  }
}

/** Deterministic ids for tests. Production uses an unguessable generator. */
export class CounterIdGenerator implements IdGenerator {
  #n = 0

  next() {
    this.#n += 1
    return `id-${this.#n}`
  }
}
