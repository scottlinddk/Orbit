import { ForbiddenError, NotFoundError, type Actor } from '@orbit/application'
import type { HouseholdId } from '@orbit/domain'
import {
  DashboardId,
  FeedId,
  InvariantViolation,
  InvitationId,
  WidgetPlacementId,
} from '@orbit/domain'
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
    let invitationA: InvitationId
    let feedA: FeedId
    let feedTokenA: string

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
      invitationA = (await uc.createInvitation(alice, householdA, {})).invitation.id
      const feed = await uc.createFeed(alice, householdA, {
        name: 'Kitchen',
        fields: ['household.name', 'dashboard.name'],
        dashboardId: dashboardA,
      })
      feedA = feed.feed.id
      feedTokenA = feed.token
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
        createInvitation: () => uc().createInvitation(as(), householdA, { role: 'owner' }),
        listInvitations: () => uc().listInvitations(as(), householdA),
        revokeInvitation: () => uc().revokeInvitation(as(), householdA, invitationA),
        createFeed: () =>
          uc().createFeed(as(), householdA, { name: 'Intruder', fields: ['household.name'] }),
        listFeeds: () => uc().listFeeds(as(), householdA),
        revokeFeed: () => uc().revokeFeed(as(), householdA, feedA),
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
        revokeInvitationMissing: () =>
          uc().revokeInvitation(as(), householdA, InvitationId('missing')),
        revokeFeedMissing: () => uc().revokeFeed(as(), householdA, FeedId('missing')),
      }
    }

    const snapshot = async () => ({
      household: await sys.useCases.getHousehold(alice, householdA),
      dashboards: await sys.useCases.listDashboards(alice, householdA),
      invitations: await sys.useCases.listInvitations(alice, householdA),
      feeds: await sys.useCases.listFeeds(alice, householdA),
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
        'createInvitation',
        'listInvitations',
        'revokeInvitation',
        'createFeed',
        'listFeeds',
        'revokeFeed',
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

    describe('invitations', () => {
      it("cannot be revoked through another household's id", async () => {
        const carolsHousehold = (await sys.useCases.listHouseholds(carol))[0]!.id
        await expect(
          sys.useCases.revokeInvitation(carol, carolsHousehold, invitationA),
        ).rejects.toBeInstanceOf(NotFoundError)
        expect(await sys.useCases.listInvitations(alice, householdA)).toHaveLength(1)
      })

      it('gives a foreign invitation id the same answer as a missing one', async () => {
        const carolsHousehold = (await sys.useCases.listHouseholds(carol))[0]!.id
        const foreign = await sys.useCases
          .revokeInvitation(carol, carolsHousehold, invitationA)
          .catch((e) => e)
        const missing = await sys.useCases
          .revokeInvitation(carol, carolsHousehold, InvitationId('missing'))
          .catch((e) => e)
        expect(foreign).toBeInstanceOf(NotFoundError)
        expect(foreign.message).toBe(missing.message)
      })
    })

    describe('feeds', () => {
      const carolsHousehold = async () => (await sys.useCases.listHouseholds(carol))[0]!.id

      it('cannot be revoked through another household id', async () => {
        await expect(
          sys.useCases.revokeFeed(carol, await carolsHousehold(), feedA),
        ).rejects.toBeInstanceOf(NotFoundError)
        expect(await sys.useCases.listFeeds(alice, householdA)).toHaveLength(1)
      })

      it('gives a foreign feed id the same answer as a missing one', async () => {
        const foreign = await sys.useCases
          .revokeFeed(carol, await carolsHousehold(), feedA)
          .catch((e) => e)
        const missing = await sys.useCases
          .revokeFeed(carol, await carolsHousehold(), FeedId('missing'))
          .catch((e) => e)
        expect(foreign).toBeInstanceOf(NotFoundError)
        expect(foreign.message).toBe(missing.message)
      })

      it("cannot publish another household's dashboard", async () => {
        const foreign = await sys.useCases
          .createFeed(carol, await carolsHousehold(), {
            name: 'Spy',
            fields: ['dashboard.name'],
            dashboardId: dashboardA,
          })
          .catch((e) => e)
        const missing = await sys.useCases
          .createFeed(carol, await carolsHousehold(), {
            name: 'Spy',
            fields: ['dashboard.name'],
            dashboardId: DashboardId('nope'),
          })
          .catch((e) => e)
        expect(foreign).toBeInstanceOf(NotFoundError)
        expect(foreign.message).toBe(missing.message)
      })

      it('reads only the fields of its own feed', async () => {
        const content = await sys.feedReader.read(feedTokenA)
        expect(content).toEqual({ household: { name: 'A' }, dashboard: { name: 'Family' } })
      })

      it("never lets another household's token read household A", async () => {
        const carols = await sys.useCases.createFeed(carol, await carolsHousehold(), {
          name: 'Hall',
          fields: ['household.name'],
        })
        expect(await sys.feedReader.read(carols.token)).toEqual({ household: { name: 'B' } })
      })

      it('answers every bad token the same way', async () => {
        await sys.useCases.revokeFeed(alice, householdA, feedA)
        const attempts = await Promise.all(
          [feedTokenA, 'unknown', '', 'x'.repeat(300)].map((t) =>
            sys.feedReader.read(t).catch((e) => e),
          ),
        )
        for (const e of attempts) {
          expect(e).toBeInstanceOf(NotFoundError)
          expect(e.message).toBe(attempts[0].message)
        }
      })

      it('stops working the moment it is revoked, and only that feed', async () => {
        const second = await sys.useCases.createFeed(alice, householdA, {
          name: 'Hall',
          fields: ['household.name'],
        })
        await sys.useCases.revokeFeed(alice, householdA, feedA)
        await expect(sys.feedReader.read(feedTokenA)).rejects.toBeInstanceOf(NotFoundError)
        await expect(sys.feedReader.read(second.token)).resolves.toBeDefined()
        expect(await sys.useCases.listFeeds(alice, householdA)).toHaveLength(1)
      })

      it('never publishes widget configuration', async () => {
        await sys.useCases.configureWidget(alice, dashboardA, widgetA, { secretRef: 'abc' })
        const wide = await sys.useCases.createFeed(alice, householdA, {
          name: 'Wide',
          fields: ['dashboard.widgets'],
          dashboardId: dashboardA,
        })
        const content = await sys.feedReader.read(wide.token)
        expect(JSON.stringify(content)).not.toContain('secretRef')
        expect(content).toEqual({ dashboard: { widgets: [{ type: 'calendar.agenda', span: 1 }] } })
      })

      it('shows an empty dashboard instead of failing when it was deleted', async () => {
        await sys.useCases.deleteDashboard(alice, dashboardA)
        expect(await sys.feedReader.read(feedTokenA)).toEqual({
          household: { name: 'A' },
          dashboard: null,
        })
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
