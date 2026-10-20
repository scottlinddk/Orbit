import type { Dashboard, DashboardId, Household, HouseholdId, User, UserId } from '@orbit/domain'

/** Implementations must return and store independent values, never shared mutable state. */
export interface UserRepository {
  get(id: UserId): Promise<User | undefined>
  save(user: User): Promise<void>
}

export interface HouseholdRepository {
  get(id: HouseholdId): Promise<Household | undefined>
  save(household: Household): Promise<void>
  listForUser(userId: UserId): Promise<Household[]>
}

export interface DashboardRepository {
  get(id: DashboardId): Promise<Dashboard | undefined>
  save(dashboard: Dashboard): Promise<void>
  listForHousehold(householdId: HouseholdId): Promise<Dashboard[]>
  delete(id: DashboardId): Promise<void>
}

/** Produces unguessable, unique ids. The domain never generates ids itself. */
export interface IdGenerator {
  next(): string
}
