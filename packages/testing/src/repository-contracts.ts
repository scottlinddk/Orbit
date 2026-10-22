import type { Repositories } from '@orbit/application'
import {
  CalendarSourceId,
  DashboardId,
  FeedId,
  HouseholdId,
  InvitationId,
  ListId,
  ListItemId,
  UserId,
  Username,
  WidgetPlacementId,
  addMember,
  addWidget,
  changeMemberRole,
  createCalendarSource,
  createDashboard,
  createFeed,
  createHousehold,
  createInvitation,
  createList,
  createUser,
  type HouseholdListItem,
} from '@orbit/domain'
import { beforeEach, describe, expect, it } from 'vitest'

export type RepositorySet = Repositories

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

    it('round-trips every role, including child and device', async () => {
      const kid = UserId('kid')
      const screen = UserId('screen')
      const h = addMember(
        addMember(
          addMember(createHousehold({ id: HouseholdId('h1'), name: 'Home', ownerId: alice }), bob),
          kid,
          'child',
        ),
        screen,
        'device',
      )
      await repos.households.save(h)
      const loaded = await repos.households.get(h.id)
      expect(loaded?.members.map((m) => m.role)).toEqual(['owner', 'member', 'child', 'device'])
      await repos.households.save(changeMemberRole(h, bob, 'device'))
      expect((await repos.households.get(h.id))?.members[1]?.role).toBe('device')
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

/** Behavior every account store must provide. */
export function describeAccountContracts(name: string, create: () => Promise<RepositorySet>) {
  describe(`account contracts: ${name}`, () => {
    let repos: RepositorySet
    beforeEach(async () => {
      repos = await create()
    })

    const account = (id: string, username: string) => ({
      user: createUser({ id: UserId(id), displayName: username }),
      credential: { userId: UserId(id), username: Username(username), passwordHash: `hash-${id}` },
    })

    it('creates the user and credential together', async () => {
      const a = account('u1', 'alice')
      expect(await repos.accounts.register(a.user, a.credential, 'open')).toBe('created')
      expect(await repos.users.get(a.user.id)).toEqual(a.user)
      expect(await repos.accounts.findCredential(Username('alice'))).toEqual(a.credential)
      expect(await repos.accounts.findCredential(Username('nobody'))).toBeUndefined()
    })

    it('rejects a taken username and stores nothing for the loser', async () => {
      const first = account('u1', 'alice')
      const second = account('u2', 'alice')
      await repos.accounts.register(first.user, first.credential, 'open')
      expect(await repos.accounts.register(second.user, second.credential, 'open')).toBe(
        'username-taken',
      )
      expect(await repos.users.get(second.user.id)).toBeUndefined()
      expect((await repos.accounts.findCredential(Username('alice')))?.userId).toBe('u1')
    })

    it('closes registration after the first account when the policy says so', async () => {
      const first = account('u1', 'alice')
      const second = account('u2', 'bobby')
      expect(await repos.accounts.register(first.user, first.credential, 'first-user-only')).toBe(
        'created',
      )
      expect(await repos.accounts.register(second.user, second.credential, 'first-user-only')).toBe(
        'registration-closed',
      )
      expect(await repos.users.get(second.user.id)).toBeUndefined()
    })

    it('answers "closed" before "taken", so a closed instance reveals no usernames', async () => {
      const first = account('u1', 'alice')
      const same = account('u2', 'alice')
      await repos.accounts.register(first.user, first.credential, 'first-user-only')
      expect(await repos.accounts.register(same.user, same.credential, 'first-user-only')).toBe(
        'registration-closed',
      )
    })

    it('replaces a password hash, and reports an unknown user', async () => {
      const a = account('u1', 'alice')
      await repos.accounts.register(a.user, a.credential, 'open')
      expect(await repos.accounts.setPasswordHash(a.user.id, 'new-hash')).toBe(true)
      expect((await repos.accounts.findCredential(Username('alice')))?.passwordHash).toBe(
        'new-hash',
      )
      expect(await repos.accounts.setPasswordHash(UserId('ghost'), 'x')).toBe(false)
    })

    it('lets concurrent registrations of one username produce exactly one account', async () => {
      const attempts = await Promise.all(
        ['u1', 'u2', 'u3', 'u4'].map((id) => {
          const a = account(id, 'racer')
          return repos.accounts.register(a.user, a.credential, 'open')
        }),
      )
      expect(attempts.filter((o) => o === 'created')).toHaveLength(1)
    })

    it('lets concurrent first-user registrations produce exactly one account', async () => {
      const attempts = await Promise.all(
        [
          ['u1', 'aaaa'],
          ['u2', 'bbbb'],
          ['u3', 'cccc'],
        ].map(([id, name]) => {
          const a = account(id!, name!)
          return repos.accounts.register(a.user, a.credential, 'first-user-only')
        }),
      )
      expect(attempts.filter((o) => o === 'created')).toHaveLength(1)
    })
  })
}

/** Behavior every session store must provide. */
export function describeSessionContracts(name: string, create: () => Promise<RepositorySet>) {
  describe(`session contracts: ${name}`, () => {
    let repos: RepositorySet
    beforeEach(async () => {
      repos = await create()
      const user = createUser({ id: UserId('u1'), displayName: 'Alice' })
      await repos.accounts.register(
        user,
        { userId: user.id, username: Username('alice'), passwordHash: 'h' },
        'open',
      )
    })

    const session = (hash: string, expires: string) => ({
      tokenHash: hash,
      userId: UserId('u1'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      expiresAt: new Date(expires),
    })

    it('round-trips a session including exact timestamps', async () => {
      const s = session('t1', '2026-01-15T12:34:56.789Z')
      await repos.sessions.create(s)
      expect(await repos.sessions.get('t1')).toEqual(s)
      expect(await repos.sessions.get('missing')).toBeUndefined()
    })

    it('deletes one session without touching others', async () => {
      await repos.sessions.create(session('t1', '2026-02-01T00:00:00.000Z'))
      await repos.sessions.create(session('t2', '2026-02-01T00:00:00.000Z'))
      await repos.sessions.delete('t1')
      expect(await repos.sessions.get('t1')).toBeUndefined()
      expect(await repos.sessions.get('t2')).toBeDefined()
    })

    it("ends one user's sessions and leaves other users' sessions alone", async () => {
      const other = createUser({ id: UserId('u2'), displayName: 'Bob' })
      await repos.accounts.register(
        other,
        { userId: other.id, username: Username('bobby'), passwordHash: 'h' },
        'open',
      )
      await repos.sessions.create(session('a1', '2026-02-01T00:00:00.000Z'))
      await repos.sessions.create(session('a2', '2026-02-01T00:00:00.000Z'))
      await repos.sessions.create({
        ...session('b1', '2026-02-01T00:00:00.000Z'),
        userId: other.id,
      })
      expect(await repos.sessions.deleteForUser(UserId('u1'))).toBe(2)
      expect(await repos.sessions.get('a1')).toBeUndefined()
      expect(await repos.sessions.get('b1')).toBeDefined()
      expect(await repos.sessions.deleteForUser(UserId('u1'))).toBe(0)
    })

    it('purges only expired sessions and reports how many', async () => {
      await repos.sessions.create(session('old', '2026-01-02T00:00:00.000Z'))
      await repos.sessions.create(session('edge', '2026-01-10T00:00:00.000Z'))
      await repos.sessions.create(session('fresh', '2026-01-20T00:00:00.000Z'))
      const removed = await repos.sessions.deleteExpired(new Date('2026-01-10T00:00:00.000Z'))
      expect(removed).toBe(2)
      expect(await repos.sessions.get('fresh')).toBeDefined()
      expect(await repos.sessions.get('edge')).toBeUndefined()
    })
  })
}

export function describeInvitationContracts(name: string, create: () => Promise<RepositorySet>) {
  describe(`invitation contracts: ${name}`, () => {
    let repos: RepositorySet
    beforeEach(async () => {
      repos = await create()
    })

    const t0 = new Date('2026-01-01T00:00:00.000Z')
    const invite = (id: string, household = 'h1', ttlDays = 7) =>
      createInvitation({
        id: InvitationId(id),
        householdId: HouseholdId(household),
        role: 'member',
        tokenHash: `hash-${id}`,
        createdBy: UserId('alice'),
        now: t0,
        ttlDays,
      })
    const later = (days: number) => new Date(t0.getTime() + days * 24 * 60 * 60 * 1000)

    it('keeps the child and device roles of an invitation', async () => {
      for (const role of ['child', 'device'] as const) {
        const i = createInvitation({
          id: InvitationId(`i-${role}`),
          householdId: HouseholdId('h1'),
          role,
          tokenHash: `hash-${role}`,
          createdBy: UserId('alice'),
          now: t0,
        })
        await repos.invitations.create(i)
        expect((await repos.invitations.get(i.id))?.role).toBe(role)
      }
    })

    it('round-trips an invitation, by id and by token hash', async () => {
      const i = invite('i1')
      await repos.invitations.create(i)
      expect(await repos.invitations.get(i.id)).toEqual(i)
      expect(await repos.invitations.findByTokenHash('hash-i1')).toEqual(i)
      expect(await repos.invitations.get(InvitationId('missing'))).toBeUndefined()
      expect(await repos.invitations.findByTokenHash('nope')).toBeUndefined()
    })

    it('refuses a second invitation with the same token hash', async () => {
      await repos.invitations.create(invite('i1'))
      await expect(
        repos.invitations.create({ ...invite('i2'), tokenHash: 'hash-i1' }),
      ).rejects.toThrow()
    })

    it('lists only the invitations of one household', async () => {
      await repos.invitations.create(invite('i1', 'h1'))
      await repos.invitations.create(invite('i2', 'h2'))
      await repos.invitations.create(invite('i3', 'h1'))
      const ids = (await repos.invitations.listForHousehold(HouseholdId('h1'))).map((i) => i.id)
      expect(ids).toEqual(['i1', 'i3'])
    })

    it('lets exactly one of two claims win', async () => {
      await repos.invitations.create(invite('i1'))
      const [a, b] = await Promise.all([
        repos.invitations.claim(InvitationId('i1'), UserId('u1'), later(1)),
        repos.invitations.claim(InvitationId('i1'), UserId('u2'), later(1)),
      ])
      expect([a, b].filter(Boolean)).toHaveLength(1)
      const stored = await repos.invitations.get(InvitationId('i1'))
      expect(stored?.acceptedAt).toEqual(later(1))
      expect(stored?.acceptedBy).toBe(a ? 'u1' : 'u2')
    })

    it('does not let an expired or revoked invitation be claimed', async () => {
      await repos.invitations.create(invite('expired', 'h1', 1))
      await repos.invitations.create(invite('revoked'))
      await repos.invitations.revoke(InvitationId('revoked'), t0)
      expect(await repos.invitations.claim(InvitationId('expired'), UserId('u1'), later(1))).toBe(
        false,
      )
      expect(await repos.invitations.claim(InvitationId('revoked'), UserId('u1'), later(0))).toBe(
        false,
      )
      expect(await repos.invitations.claim(InvitationId('missing'), UserId('u1'), t0)).toBe(false)
    })

    it('hands a claim back only to the user who made it', async () => {
      await repos.invitations.create(invite('i1'))
      await repos.invitations.claim(InvitationId('i1'), UserId('u1'), t0)
      await repos.invitations.release(InvitationId('i1'), UserId('u2'))
      expect((await repos.invitations.get(InvitationId('i1')))?.acceptedBy).toBe('u1')
      await repos.invitations.release(InvitationId('i1'), UserId('u1'))
      const released = await repos.invitations.get(InvitationId('i1'))
      expect(released?.acceptedBy).toBeUndefined()
      expect(released?.acceptedAt).toBeUndefined()
      expect(await repos.invitations.claim(InvitationId('i1'), UserId('u3'), t0)).toBe(true)
    })

    it('revokes once, and not after it was accepted', async () => {
      await repos.invitations.create(invite('i1'))
      await repos.invitations.create(invite('i2'))
      expect(await repos.invitations.revoke(InvitationId('i1'), later(1))).toBe(true)
      expect((await repos.invitations.get(InvitationId('i1')))?.revokedAt).toEqual(later(1))
      expect(await repos.invitations.revoke(InvitationId('i1'), later(2))).toBe(false)
      await repos.invitations.claim(InvitationId('i2'), UserId('u1'), t0)
      expect(await repos.invitations.revoke(InvitationId('i2'), later(1))).toBe(false)
      expect(await repos.invitations.revoke(InvitationId('missing'), t0)).toBe(false)
    })
  })
}

export function describeFeedContracts(name: string, create: () => Promise<RepositorySet>) {
  describe(`feed contracts: ${name}`, () => {
    let repos: RepositorySet
    beforeEach(async () => {
      repos = await create()
    })

    const t0 = new Date('2026-01-01T00:00:00.000Z')
    const feed = (id: string, household = 'h1') =>
      createFeed({
        id: FeedId(id),
        householdId: HouseholdId(household),
        name: `Feed ${id}`,
        fields: ['household.name', 'dashboard.widgets'],
        dashboardId: DashboardId('d1'),
        tokenHash: `hash-${id}`,
        createdBy: UserId('alice'),
        now: t0,
      })

    it('round-trips a feed, by id and by token hash', async () => {
      const f = feed('f1')
      await repos.feeds.create(f)
      expect(await repos.feeds.get(f.id)).toEqual(f)
      expect(await repos.feeds.findByTokenHash('hash-f1')).toEqual(f)
      expect(await repos.feeds.get(FeedId('missing'))).toBeUndefined()
      expect(await repos.feeds.findByTokenHash('nope')).toBeUndefined()
    })

    it('round-trips a feed without a dashboard', async () => {
      const f = createFeed({
        id: FeedId('f1'),
        householdId: HouseholdId('h1'),
        name: 'Hall',
        fields: ['household.name'],
        tokenHash: 'hash-f1',
        createdBy: UserId('alice'),
        now: t0,
      })
      await repos.feeds.create(f)
      expect(await repos.feeds.get(f.id)).toEqual(f)
    })

    it('round-trips a feed that publishes a list', async () => {
      const f = createFeed({
        id: FeedId('f1'),
        householdId: HouseholdId('h1'),
        name: 'Fridge',
        fields: ['list.name', 'list.items'],
        listId: ListId('l1'),
        tokenHash: 'hash-f1',
        createdBy: UserId('alice'),
        now: t0,
      })
      await repos.feeds.create(f)
      expect(await repos.feeds.get(f.id)).toEqual(f)
    })

    it('refuses a second feed with the same token hash', async () => {
      await repos.feeds.create(feed('f1'))
      await expect(repos.feeds.create({ ...feed('f2'), tokenHash: 'hash-f1' })).rejects.toThrow()
    })

    it('lists only the feeds of one household', async () => {
      await repos.feeds.create(feed('f1', 'h1'))
      await repos.feeds.create(feed('f2', 'h2'))
      await repos.feeds.create(feed('f3', 'h1'))
      const ids = (await repos.feeds.listForHousehold(HouseholdId('h1'))).map((f) => f.id)
      expect(ids).toEqual(['f1', 'f3'])
    })

    it('revokes once and keeps the feed as history', async () => {
      await repos.feeds.create(feed('f1'))
      expect(await repos.feeds.revoke(FeedId('f1'), t0)).toBe(true)
      expect(await repos.feeds.revoke(FeedId('f1'), t0)).toBe(false)
      expect(await repos.feeds.revoke(FeedId('missing'), t0)).toBe(false)
      expect((await repos.feeds.get(FeedId('f1')))?.revokedAt).toEqual(t0)
    })
  })
}

export function describeListContracts(name: string, create: () => Promise<RepositorySet>) {
  describe(`list contracts: ${name}`, () => {
    let repos: RepositorySet
    beforeEach(async () => {
      repos = await create()
    })

    const t0 = new Date('2026-01-01T00:00:00.000Z')
    const t1 = new Date('2026-01-02T00:00:00.000Z')
    const alice = UserId('alice')
    const list = (id: string, household = 'h1') =>
      createList({
        id: ListId(id),
        householdId: HouseholdId(household),
        name: `List ${id}`,
        kind: 'shopping',
        createdBy: alice,
        now: t0,
      })
    const item = (
      id: string,
      listId: string,
      position: number,
      extra: Partial<HouseholdListItem> = {},
    ): HouseholdListItem => ({
      id: ListItemId(id),
      listId: ListId(listId),
      text: `Item ${id}`,
      done: false,
      position,
      createdBy: alice,
      createdAt: t0,
      updatedBy: alice,
      updatedAt: t0,
      ...extra,
    })

    it('round-trips a list, renames it, and lists only one household', async () => {
      const l = list('l1')
      await repos.lists.createList(l)
      await repos.lists.createList(list('l2', 'h2'))
      await repos.lists.createList(list('l3'))
      expect(await repos.lists.getList(l.id)).toEqual(l)
      expect(await repos.lists.getList(ListId('missing'))).toBeUndefined()
      expect((await repos.lists.listsForHousehold(HouseholdId('h1'))).map((x) => x.id)).toEqual([
        'l1',
        'l3',
      ])
      await repos.lists.saveList({ ...l, name: 'Renamed' })
      expect((await repos.lists.getList(l.id))?.name).toBe('Renamed')
    })

    it('refuses a duplicate list id', async () => {
      await repos.lists.createList(list('l1'))
      await expect(repos.lists.createList(list('l1'))).rejects.toThrow()
    })

    it('stores items in position order with optional fields', async () => {
      await repos.lists.createList(list('l1'))
      const rich = item('b', 'l1', 1, { quantity: '2 l', note: 'oat' })
      await repos.lists.saveItems([rich, item('a', 'l1', 0)])
      const items = await repos.lists.items(ListId('l1'))
      expect(items.map((i) => i.id)).toEqual(['a', 'b'])
      expect(items[1]).toEqual(rich)
      expect(items[0]!.quantity).toBeUndefined()
      expect(await repos.lists.getItem(ListItemId('b'))).toEqual(rich)
      expect(await repos.lists.getItem(ListItemId('missing'))).toBeUndefined()
    })

    it('replaces an item on save and can clear its optional fields', async () => {
      await repos.lists.createList(list('l1'))
      await repos.lists.saveItems([item('a', 'l1', 0, { quantity: '1', note: 'x' })])
      const changed = item('a', 'l1', 3, { done: true, updatedAt: t1 })
      await repos.lists.saveItems([changed])
      expect(await repos.lists.getItem(ListItemId('a'))).toEqual(changed)
    })

    it('keeps items of different lists apart', async () => {
      await repos.lists.createList(list('l1'))
      await repos.lists.createList(list('l2'))
      await repos.lists.saveItems([item('a', 'l1', 0), item('b', 'l2', 0)])
      expect((await repos.lists.items(ListId('l1'))).map((i) => i.id)).toEqual(['a'])
      expect((await repos.lists.items(ListId('l2'))).map((i) => i.id)).toEqual(['b'])
    })

    it('deletes one item, and the completed ones of one list', async () => {
      await repos.lists.createList(list('l1'))
      await repos.lists.createList(list('l2'))
      await repos.lists.saveItems([
        item('a', 'l1', 0),
        item('b', 'l1', 1, { done: true }),
        item('c', 'l1', 2, { done: true }),
        item('d', 'l2', 0, { done: true }),
      ])
      await repos.lists.deleteItem(ListItemId('a'))
      expect(await repos.lists.deleteCompleted(ListId('l1'))).toBe(2)
      expect(await repos.lists.deleteCompleted(ListId('l1'))).toBe(0)
      expect(await repos.lists.items(ListId('l1'))).toEqual([])
      expect(await repos.lists.items(ListId('l2'))).toHaveLength(1)
    })

    it('deletes a list together with its items and nothing else', async () => {
      await repos.lists.createList(list('l1'))
      await repos.lists.createList(list('l2'))
      await repos.lists.saveItems([item('a', 'l1', 0), item('b', 'l2', 0)])
      await repos.lists.deleteList(ListId('l1'))
      expect(await repos.lists.getList(ListId('l1'))).toBeUndefined()
      expect(await repos.lists.getItem(ListItemId('a'))).toBeUndefined()
      expect(await repos.lists.getItem(ListItemId('b'))).toBeDefined()
    })

    it('saves a batch of items all or none', async () => {
      await repos.lists.createList(list('l1'))
      await expect(
        repos.lists.saveItems([item('a', 'l1', 0), item('b', 'no-such-list', 0)]),
      ).rejects.toThrow()
      expect(await repos.lists.items(ListId('l1'))).toEqual([])
    })
  })
}

export function describeCalendarSourceContracts(
  name: string,
  create: () => Promise<RepositorySet>,
) {
  describe(`calendar source contracts: ${name}`, () => {
    let repos: RepositorySet
    beforeEach(async () => {
      repos = await create()
    })

    const t0 = new Date('2026-01-01T00:00:00.000Z')
    const source = (id: string, household = 'h1', color?: string) =>
      createCalendarSource({
        id: CalendarSourceId(id),
        householdId: HouseholdId(household),
        name: `Calendar ${id}`,
        color,
        host: 'cal.example.com',
        createdBy: UserId('alice'),
        now: t0,
      })

    it('round-trips a source with and without a color', async () => {
      const plain = source('s1')
      const colored = source('s2', 'h1', '#aa00ff')
      await repos.calendarSources.create(plain)
      await repos.calendarSources.create(colored)
      expect(await repos.calendarSources.get(plain.id)).toEqual(plain)
      expect(await repos.calendarSources.get(colored.id)).toEqual(colored)
      expect(await repos.calendarSources.get(CalendarSourceId('missing'))).toBeUndefined()
    })

    it('lists only the sources of one household, oldest first', async () => {
      await repos.calendarSources.create(source('s1'))
      await repos.calendarSources.create(source('s2', 'h2'))
      await repos.calendarSources.create(source('s3'))
      const list = await repos.calendarSources.listForHousehold(HouseholdId('h1'))
      expect(list.map((s) => s.id)).toEqual(['s1', 's3'])
    })

    it('refuses a duplicate id and deletes only the one source', async () => {
      await repos.calendarSources.create(source('s1'))
      await expect(repos.calendarSources.create(source('s1'))).rejects.toThrow()
      await repos.calendarSources.create(source('s2'))
      await repos.calendarSources.delete(CalendarSourceId('s1'))
      expect(await repos.calendarSources.get(CalendarSourceId('s1'))).toBeUndefined()
      expect(await repos.calendarSources.get(CalendarSourceId('s2'))).toBeDefined()
    })
  })
}
