import { ForbiddenError, NotFoundError, type Actor } from '@orbit/application'
import type { HouseholdId } from '@orbit/domain'
import {
  CalendarSourceId,
  DashboardId,
  FeedId,
  InvariantViolation,
  InvitationId,
  ListId,
  ListItemId,
  WidgetPlacementId,
} from '@orbit/domain'
import { beforeEach, describe, expect, it } from 'vitest'
import type { TestSystem } from './fixtures.ts'

/**
 * Household isolation: the security invariant every protected operation must keep.
 *
 * Scenario: Alice owns household A, Bob is a plain member of it, Dave is a child and Eve is a
 * display device. Carol owns household B
 * and has no relation to A. Every operation that takes an id is tried by Carol against A's
 * resources, and by Bob where his role should not allow it.
 *
 * Add every new household-scoped use case to the tables below. A use case missing here is a
 * gap in the security test suite.
 */
const CALENDAR_URL = 'https://calendar.example.com/private/abc123.ics'
/** Inside the window around the test clock's 2026-01-01. */
const CALENDAR_RANGE = {
  from: new Date('2026-01-01T00:00:00Z'),
  to: new Date('2026-01-08T00:00:00Z'),
}

export function describeHouseholdIsolation(name: string, create: () => TestSystem) {
  describe(`household isolation: ${name}`, () => {
    let sys: TestSystem
    let alice: Actor, bob: Actor, carol: Actor, dave: Actor, eve: Actor
    let householdA: HouseholdId
    let dashboardA: DashboardId
    let widgetA: WidgetPlacementId
    let invitationA: InvitationId
    let feedA: FeedId
    let feedTokenA: string
    let listA: ListId
    let itemA: ListItemId
    let calendarSourceA: CalendarSourceId

    beforeEach(async () => {
      sys = create()
      alice = await sys.newActor('alice')
      bob = await sys.newActor('bob')
      carol = await sys.newActor('carol')
      dave = await sys.newActor('dave')
      eve = await sys.newActor('eve')
      const { useCases: uc } = sys
      householdA = (await uc.createHousehold(alice, { name: 'A' })).id
      await uc.addHouseholdMember(alice, householdA, { userId: bob.userId })
      await uc.addHouseholdMember(alice, householdA, { userId: dave.userId, role: 'child' })
      await uc.addHouseholdMember(alice, householdA, { userId: eve.userId, role: 'device' })
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
      const list = await uc.createList(alice, householdA, { name: 'Groceries', kind: 'shopping' })
      listA = list.list.id
      itemA = (await uc.addListItem(alice, householdA, listA, { text: 'Milk' })).items[0]!.id
      sys.calendarReader.feeds.set(CALENDAR_URL, [
        {
          kind: 'timed',
          id: 'e1',
          title: 'Private appointment',
          start: '2026-01-02T09:00:00.000Z',
          end: '2026-01-02T10:00:00.000Z',
          isOverride: false,
          isRecurring: false,
        },
      ])
      calendarSourceA = (
        await sys.calendar.addSource(alice, householdA, { name: 'Family', url: CALENDAR_URL })
      ).id
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
        changeHouseholdMemberRole: () =>
          uc().changeHouseholdMemberRole(as(), householdA, bob.userId, 'owner'),
        createInvitation: () => uc().createInvitation(as(), householdA, { role: 'member' }),
        listInvitations: () => uc().listInvitations(as(), householdA),
        revokeInvitation: () => uc().revokeInvitation(as(), householdA, invitationA),
        createFeed: () =>
          uc().createFeed(as(), householdA, { name: 'Intruder', fields: ['household.name'] }),
        listFeeds: () => uc().listFeeds(as(), householdA),
        revokeFeed: () => uc().revokeFeed(as(), householdA, feedA),
        addCalendarSource: () =>
          sys.calendar.addSource(as(), householdA, { name: 'Intruder', url: CALENDAR_URL }),
        listCalendarSources: () => sys.calendar.listSources(as(), householdA),
        removeCalendarSource: () => sys.calendar.removeSource(as(), householdA, calendarSourceA),
        calendarEvents: () => sys.calendar.events(as(), householdA, CALENDAR_RANGE),
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
        createList: () => uc().createList(as(), householdA, { name: 'Intruder', kind: 'todo' }),
        listLists: () => uc().listLists(as(), householdA),
        getList: () => uc().getList(as(), householdA, listA),
        renameList: () => uc().renameList(as(), householdA, listA, 'Hacked'),
        addListItem: () => uc().addListItem(as(), householdA, listA, { text: 'Intruder' }),
        updateListItem: () =>
          uc().updateListItem(as(), householdA, listA, itemA, { text: 'Hacked', done: true }),
        moveListItem: () => uc().moveListItem(as(), householdA, listA, itemA, 0),
        deleteListItem: () => uc().deleteListItem(as(), householdA, listA, itemA),
        clearCompletedListItems: () => uc().clearCompletedListItems(as(), householdA, listA),
        deleteList: () => uc().deleteList(as(), householdA, listA),
        // Operations on ids that do not exist must be indistinguishable from foreign ones.
        removeWidgetMissing: () => uc().removeWidget(as(), dashboardA, missingWidget),
        revokeInvitationMissing: () =>
          uc().revokeInvitation(as(), householdA, InvitationId('missing')),
        revokeFeedMissing: () => uc().revokeFeed(as(), householdA, FeedId('missing')),
        getListMissing: () => uc().getList(as(), householdA, ListId('missing')),
        updateListItemMissing: () =>
          uc().updateListItem(as(), householdA, listA, ListItemId('missing'), { done: true }),
        removeCalendarSourceMissing: () =>
          sys.calendar.removeSource(as(), householdA, CalendarSourceId('missing')),
      }
    }

    const snapshot = async () => ({
      household: await sys.useCases.getHousehold(alice, householdA),
      dashboards: await sys.useCases.listDashboards(alice, householdA),
      invitations: await sys.useCases.listInvitations(alice, householdA),
      feeds: await sys.useCases.listFeeds(alice, householdA),
      lists: await sys.useCases.listLists(alice, householdA),
      list: await sys.useCases.getList(alice, householdA, listA),
      calendarSources: await sys.calendar.listSources(alice, householdA),
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

    const writes = [
      'addHouseholdMember',
      'addHouseholdMemberByUsername',
      'removeHouseholdMember',
      'changeHouseholdMemberRole',
      'createInvitation',
      'listInvitations',
      'revokeInvitation',
      'createFeed',
      'listFeeds',
      'revokeFeed',
      'addCalendarSource',
      'removeCalendarSource',
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
    describe('a plain member', () => {
      it('can read', async () => {
        await expect(operations(() => bob).getHousehold()).resolves.toBeDefined()
        // The starter dashboard every household gets, and the one this kit creates.
        await expect(operations(() => bob).listDashboards()).resolves.toHaveLength(2)
        await expect(operations(() => bob).getDashboard()).resolves.toBeDefined()
        await expect(operations(() => bob).listCalendarSources()).resolves.toHaveLength(1)
        await expect(operations(() => bob).calendarEvents()).resolves.toMatchObject({
          events: [{ title: 'Private appointment' }],
        })
      })

      it.each(writes)('%s is forbidden and changes nothing', async (op) => {
        const before = await snapshot()
        const attempt = (operations(() => bob) as Record<string, () => Promise<unknown>>)[op]!
        await expect(attempt()).rejects.toBeInstanceOf(ForbiddenError)
        expect(await snapshot()).toEqual(before)
      })
    })

    describe.each([
      ['a child', () => dave],
      ['a device', () => eve],
    ] as const)('%s', (_label, who) => {
      it.each(writes)('%s is forbidden and changes nothing', async (op) => {
        const before = await snapshot()
        const attempt = (operations(who) as Record<string, () => Promise<unknown>>)[op]!
        await expect(attempt()).rejects.toBeInstanceOf(ForbiddenError)
        expect(await snapshot()).toEqual(before)
      })

      it('can read dashboards but never learns who else is in the household', async () => {
        await expect(operations(who).listDashboards()).resolves.toHaveLength(2)
        await expect(operations(who).getDashboard()).resolves.toBeDefined()
        const viewed = await operations(who).getHousehold()
        expect(viewed.members.map((m) => m.userId)).toEqual([who().userId])
        const listed = await sys.useCases.listHouseholds(who())
        expect(listed[0]!.members.map((m) => m.userId)).toEqual([who().userId])
      })
    })

    describe('lists', () => {
      const carolsHousehold = async () => (await sys.useCases.listHouseholds(carol))[0]!.id

      it('are shared: a plain member can read and change them', async () => {
        await expect(operations(() => bob).listLists()).resolves.toHaveLength(1)
        await expect(operations(() => bob).getList()).resolves.toBeDefined()
        await expect(operations(() => bob).addListItem()).resolves.toBeDefined()
        await expect(operations(() => bob).updateListItem()).resolves.toBeDefined()
        await expect(operations(() => bob).clearCompletedListItems()).resolves.toBeDefined()
        await expect(operations(() => bob).deleteList()).resolves.toBeUndefined()
      })

      it("cannot be reached through another household's id", async () => {
        const carols = await carolsHousehold()
        const before = await snapshot()
        for (const attempt of [
          () => sys.useCases.getList(carol, carols, listA),
          () => sys.useCases.renameList(carol, carols, listA, 'Hacked'),
          () => sys.useCases.addListItem(carol, carols, listA, { text: 'Intruder' }),
          () => sys.useCases.updateListItem(carol, carols, listA, itemA, { done: true }),
          () => sys.useCases.moveListItem(carol, carols, listA, itemA, 0),
          () => sys.useCases.deleteListItem(carol, carols, listA, itemA),
          () => sys.useCases.clearCompletedListItems(carol, carols, listA),
          () => sys.useCases.deleteList(carol, carols, listA),
        ])
          await expect(attempt()).rejects.toBeInstanceOf(NotFoundError)
        expect(await snapshot()).toEqual(before)
      })

      it('gives a foreign list the same answer as a missing one', async () => {
        const carols = await carolsHousehold()
        const foreign = await sys.useCases.getList(carol, carols, listA).catch((e) => e)
        const missing = await sys.useCases.getList(carol, carols, ListId('nope')).catch((e) => e)
        expect(foreign).toBeInstanceOf(NotFoundError)
        expect(foreign.message).toBe(missing.message)
      })

      it("does not move an item through another household's own list", async () => {
        const carols = await carolsHousehold()
        const carolsList = (
          await sys.useCases.createList(carol, carols, { name: 'Mine', kind: 'todo' })
        ).list.id
        await expect(
          sys.useCases.updateListItem(carol, carols, carolsList, itemA, { done: true }),
        ).rejects.toBeInstanceOf(NotFoundError)
        expect((await sys.useCases.getList(alice, householdA, listA)).items[0]!.done).toBe(false)
      })

      it("cannot be published through another household's feed", async () => {
        const carols = await carolsHousehold()
        const foreign = await sys.useCases
          .createFeed(carol, carols, { name: 'Spy', fields: ['list.items'], listId: listA })
          .catch((e) => e)
        const missing = await sys.useCases
          .createFeed(carol, carols, {
            name: 'Spy',
            fields: ['list.items'],
            listId: ListId('nope'),
          })
          .catch((e) => e)
        expect(foreign).toBeInstanceOf(NotFoundError)
        expect(foreign.message).toBe(missing.message)
      })

      it('are published only by the feed that names them', async () => {
        const fridge = await sys.useCases.createFeed(alice, householdA, {
          name: 'Fridge',
          fields: ['list.items'],
          listId: listA,
        })
        expect(await sys.feedReader.read(fridge.token)).toEqual({
          list: { items: [{ text: 'Milk' }] },
        })
        // The kit's own feed names no list, so it shows none.
        expect(JSON.stringify(await sys.feedReader.read(feedTokenA))).not.toContain('Milk')
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

    describe('calendars', () => {
      const carolsHousehold = async () => (await sys.useCases.listHouseholds(carol))[0]!.id

      it("cannot be removed through another household's id", async () => {
        await expect(
          sys.calendar.removeSource(carol, await carolsHousehold(), calendarSourceA),
        ).rejects.toBeInstanceOf(NotFoundError)
        expect(await sys.calendar.listSources(alice, householdA)).toHaveLength(1)
      })

      it('gives a foreign source id the same answer as a missing one', async () => {
        const foreign = await sys.calendar
          .removeSource(carol, await carolsHousehold(), calendarSourceA)
          .catch((e) => e)
        const missing = await sys.calendar
          .removeSource(carol, await carolsHousehold(), CalendarSourceId('missing'))
          .catch((e) => e)
        expect(foreign).toBeInstanceOf(NotFoundError)
        expect(foreign.message).toBe(missing.message)
      })

      it("never shows another household's events in your own", async () => {
        const mine = await sys.calendar.events(carol, await carolsHousehold(), CALENDAR_RANGE)
        expect(mine).toEqual({ events: [], sources: [] })
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

      it('lets an owner change a role, which takes effect at once', async () => {
        await sys.useCases.changeHouseholdMemberRole(alice, householdA, bob.userId, 'device')
        await expect(operations(() => bob).listDashboards()).resolves.toHaveLength(2)
        await expect(operations(() => bob).createDashboard()).rejects.toBeInstanceOf(ForbiddenError)
        const viewed = await sys.useCases.getHousehold(bob, householdA)
        expect(viewed.members.map((m) => m.userId)).toEqual([bob.userId])
      })

      it('cannot demote the last owner, and a missing member is not found', async () => {
        await expect(
          sys.useCases.changeHouseholdMemberRole(alice, householdA, alice.userId, 'member'),
        ).rejects.toBeInstanceOf(InvariantViolation)
        await expect(
          sys.useCases.changeHouseholdMemberRole(alice, householdA, carol.userId, 'member'),
        ).rejects.toBeInstanceOf(NotFoundError)
      })

      it('never makes an owner through an invitation', async () => {
        await expect(
          sys.useCases.createInvitation(alice, householdA, { role: 'owner' as never }),
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
