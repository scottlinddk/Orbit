import type { DashboardRepository, HouseholdRepository, UserRepository } from '@orbit/application'
import {
  DashboardId,
  HouseholdId,
  UserId,
  WidgetPlacementId,
  addMember,
  addWidget,
  createDashboard,
  createHousehold,
  createUser,
} from '@orbit/domain'
import { beforeEach, describe, expect, it } from 'vitest'

export interface RepositorySet {
  users: UserRepository
  households: HouseholdRepository
  dashboards: DashboardRepository
}

/**
 * Behavior every persistence adapter must provide. Run it from the adapter's own test file:
 * `describeRepositoryContracts('sqlite', async () => ({ ...fresh repositories... }))`.
 * The factory must return empty repositories on every call.
 */
export function describeRepositoryContracts(name: string, create: () => Promise<RepositorySet>) {
  describe(`repository contracts: ${name}`, () => {
    let repos: RepositorySet
    beforeEach(async () => {
      repos = await create()
    })

    const alice = UserId('alice')
    const bob = UserId('bob')

    it('stores and returns users, and returns undefined for unknown ids', async () => {
      const user = createUser({ id: alice, displayName: 'Alice' })
      await repos.users.save(user)
      expect(await repos.users.get(alice)).toEqual(user)
      expect(await repos.users.get(bob)).toBeUndefined()
    })

    it('round-trips a household with its members and overwrites on save', async () => {
      const h = createHousehold({ id: HouseholdId('h1'), name: 'Home', ownerId: alice })
      await repos.households.save(h)
      expect(await repos.households.get(h.id)).toEqual(h)
      const bigger = addMember(h, bob)
      await repos.households.save(bigger)
      expect(await repos.households.get(h.id)).toEqual(bigger)
      expect(await repos.households.get(HouseholdId('missing'))).toBeUndefined()
    })

    it('lists only the households a user belongs to', async () => {
      const mine = createHousehold({ id: HouseholdId('h1'), name: 'Mine', ownerId: alice })
      const shared = addMember(
        createHousehold({ id: HouseholdId('h2'), name: 'Shared', ownerId: bob }),
        alice,
      )
      const others = createHousehold({ id: HouseholdId('h3'), name: 'Others', ownerId: bob })
      for (const h of [mine, shared, others]) await repos.households.save(h)
      const ids = (await repos.households.listForUser(alice)).map((h) => h.id).sort()
      expect(ids).toEqual(['h1', 'h2'])
    })

    it('round-trips a dashboard including widget order and config', async () => {
      let d = createDashboard({
        id: DashboardId('d1'),
        householdId: HouseholdId('h1'),
        name: 'Week',
      })
      d = addWidget(d, {
        id: WidgetPlacementId('w1'),
        type: 'calendar.agenda',
        config: { days: 7, nested: { list: [1, 'two', null] } },
      })
      d = addWidget(d, { id: WidgetPlacementId('w2'), type: 'lists.shopping', span: 2 })
      await repos.dashboards.save(d)
      expect(await repos.dashboards.get(d.id)).toEqual(d)
    })

    it('lists dashboards per household and deletes them', async () => {
      const mk = (id: string, household: string) =>
        createDashboard({
          id: DashboardId(id),
          householdId: HouseholdId(household),
          name: id,
        })
      for (const d of [mk('d1', 'h1'), mk('d2', 'h1'), mk('d3', 'h2')]) {
        await repos.dashboards.save(d)
      }
      const ids = async (h: string) =>
        (await repos.dashboards.listForHousehold(HouseholdId(h))).map((d) => d.id).sort()
      expect(await ids('h1')).toEqual(['d1', 'd2'])
      expect(await ids('h2')).toEqual(['d3'])
      await repos.dashboards.delete(DashboardId('d1'))
      expect(await repos.dashboards.get(DashboardId('d1'))).toBeUndefined()
      expect(await ids('h1')).toEqual(['d2'])
    })

    it('treats deleting an unknown dashboard as a no-op', async () => {
      await expect(repos.dashboards.delete(DashboardId('nope'))).resolves.toBeUndefined()
    })
  })
}
