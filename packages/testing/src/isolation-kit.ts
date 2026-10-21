import { ForbiddenError, NotFoundError, type Actor } from '@orbit/application'
import type { HouseholdId } from '@orbit/domain'
import { DashboardId, InvariantViolation, WidgetPlacementId } from '@orbit/domain'
import { beforeEach, describe, expect, it } from 'vitest'
import type { TestSystem } from './fixtures.ts'

/**
 * Household isolation: the security invariant every protected operation must keep.
 *
 * Scenario: Alice owns household A and Bob is a plain member of it. Carol owns household B
 * and has no relation to A. Every operation that takes an id is tried by Carol against A's
 * resources, and by Bob where his role should not allow it.
 *
 * Add every new household-scoped use case to the tables below. A use case missing here is a
 * gap in the security test suite.
 */
export function describeHouseholdIsolation(name: string, create: () => TestSystem) {
  describe(`household isolation: ${name}`, () => {
    let sys: TestSystem
    let alice: Actor, bob: Actor, carol: Actor
    let householdA: HouseholdId
    let dashboardA: DashboardId
    let widgetA: WidgetPlacementId

    beforeEach(async () => {
      sys = create()
      alice = await sys.newActor('alice')
      bob = await sys.newActor('bob')
      carol = await sys.newActor('carol')
      const { useCases: uc } = sys
      householdA = (await uc.createHousehold(alice, { name: 'A' })).id
      await uc.addHouseholdMember(alice, householdA, { userId: bob.userId })
      await uc.createHousehold(carol, { name: 'B' })
      const dashboard = await uc.createDashboard(alice, householdA, { name: 'Family' })
      dashboardA = dashboard.id
      const withWidget = await uc.addWidget(alice, dashboardA, { type: 'calendar.agenda' })
      widgetA = withWidget.widgets[0]!.id
    })

    /** Every operation, parameterized by who performs it. */
    const operations = (as: () => Actor) => {
      const uc = () => sys.useCases
      const missingWidget = WidgetPlacementId('missing')
      return {
        getHousehold: () => uc().getHousehold(as(), householdA),
        addHouseholdMember: () =>
          uc().addHouseholdMember(as(), householdA, { userId: carol.userId }),
        addHouseholdMemberByUsername: () =>
          uc().addHouseholdMemberByUsername(as(), householdA, { username: 'carol' }),
        removeHouseholdMember: () => uc().removeHouseholdMember(as(), householdA, alice.userId),
        createDashboard: () => uc().createDashboard(as(), householdA, { name: 'Intruder' }),
        listDashboards: () => uc().listDashboards(as(), householdA),
        getDashboard: () => uc().getDashboard(as(), dashboardA),
        renameDashboard: () => uc().renameDashboard(as(), dashboardA, 'Hacked'),
        setDashboardColumns: () => uc().setDashboardColumns(as(), dashboardA, 1),
        addWidget: () => uc().addWidget(as(), dashboardA, { type: 'lists.shopping' }),
        removeWidget: () => uc().removeWidget(as(), dashboardA, widgetA),
        moveWidget: () => uc().moveWidget(as(), dashboardA, widgetA, 0),
        resizeWidget: () => uc().resizeWidget(as(), dashboardA, widgetA, 2),
        configureWidget: () => uc().configureWidget(as(), dashboardA, widgetA, { hacked: true }),
        deleteDashboard: () => uc().deleteDashboard(as(), dashboardA),
        // Operations on ids that do not exist must be indistinguishable from foreign ones.
        removeWidgetMissing: () => uc().removeWidget(as(), dashboardA, missingWidget),
      }
    }

    const snapshot = async () => ({
      household: await sys.useCases.getHousehold(alice, householdA),
      dashboards: await sys.useCases.listDashboards(alice, householdA),
    })

    describe('a user from another household', () => {
      const names = Object.keys(operations(() => carol))
      it.each(names)('%s is rejected as not found', async (op) => {
        const before = await snapshot()
        const attempt = (operations(() => carol) as Record<string, () => Promise<unknown>>)[op]!
        await expect(attempt()).rejects.toBeInstanceOf(NotFoundError)
        expect(await snapshot()).toEqual(before)
      })

      it('gets the same error for a foreign id as for an id that does not exist', async () => {
        const foreign = await sys.useCases.getDashboard(carol, dashboardA).catch((e) => e)
        const missing = await sys.useCases.getDashboard(carol, DashboardId('nope')).catch((e) => e)
        expect(foreign).toBeInstanceOf(NotFoundError)
        expect(foreign.message).toBe(missing.message)
        expect(foreign.constructor).toBe(missing.constructor)
      })

      it('never sees household A in their own listings', async () => {
        const households = await sys.useCases.listHouseholds(carol)
        expect(households.map((h) => h.id)).not.toContain(householdA)
      })
    })

    describe('a plain member', () => {
      it('can read', async () => {
        await expect(operations(() => bob).getHousehold()).resolves.toBeDefined()
        // The starter dashboard every household gets, and the one this kit creates.
        await expect(operations(() => bob).listDashboards()).resolves.toHaveLength(2)
        await expect(operations(() => bob).getDashboard()).resolves.toBeDefined()
      })

      const writes = [
        'addHouseholdMember',
        'addHouseholdMemberByUsername',
        'removeHouseholdMember',
        'createDashboard',
        'renameDashboard',
        'setDashboardColumns',
        'addWidget',
        'removeWidget',
        'moveWidget',
        'resizeWidget',
        'configureWidget',
        'deleteDashboard',
      ]
      it.each(writes)('%s is forbidden and changes nothing', async (op) => {
        const before = await snapshot()
        const attempt = (operations(() => bob) as Record<string, () => Promise<unknown>>)[op]!
        await expect(attempt()).rejects.toBeInstanceOf(ForbiddenError)
        expect(await snapshot()).toEqual(before)
      })
    })

    describe('membership changes', () => {
      it('revokes access immediately when a member is removed', async () => {
        await sys.useCases.removeHouseholdMember(alice, householdA, bob.userId)
        await expect(operations(() => bob).getDashboard()).rejects.toBeInstanceOf(NotFoundError)
        await expect(operations(() => bob).getHousehold()).rejects.toBeInstanceOf(NotFoundError)
      })

      it('grants access to a newly added member', async () => {
        await sys.useCases.addHouseholdMember(alice, householdA, { userId: carol.userId })
        await expect(operations(() => carol).getDashboard()).resolves.toBeDefined()
      })

      it('cannot remove the last owner', async () => {
        await expect(
          sys.useCases.removeHouseholdMember(alice, householdA, alice.userId),
        ).rejects.toBeInstanceOf(InvariantViolation)
      })

      it('lets a second owner manage the household', async () => {
        await sys.useCases.addHouseholdMember(alice, householdA, {
          userId: carol.userId,
          role: 'owner',
        })
        await expect(operations(() => carol).renameDashboard()).resolves.toBeDefined()
      })
    })
  })
}
