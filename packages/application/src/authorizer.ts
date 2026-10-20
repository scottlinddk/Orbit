import { can, roleOf, type Household, type HouseholdAction, type HouseholdId } from '@orbit/domain'
import type { Actor } from './actor.ts'
import { ForbiddenError, NotFoundError } from './errors.ts'
import type { HouseholdRepository } from './ports.ts'

/**
 * The single place where household access is decided. Every use case that touches a
 * household-owned resource calls this first, before reading or changing anything else.
 */
export interface Authorizer {
  /**
   * Returns the household when the actor is a member whose role allows `action`.
   * Non-members get NotFoundError, so another household's ids reveal nothing.
   */
  require(actor: Actor, householdId: HouseholdId, action: HouseholdAction): Promise<Household>
}

export function createAuthorizer(households: HouseholdRepository): Authorizer {
  return {
    async require(actor, householdId, action) {
      const household = await households.get(householdId)
      const role = household ? roleOf(household, actor.userId) : undefined
      if (!household || !role) throw new NotFoundError()
      if (!can(role, action)) throw new ForbiddenError(action)
      return household
    },
  }
}
