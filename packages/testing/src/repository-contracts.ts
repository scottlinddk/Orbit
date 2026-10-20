import type { Repositories } from '@orbit/application'
import {
  DashboardId,
  HouseholdId,
  UserId,
  Username,
  WidgetPlacementId,
  addMember,
  addWidget,
  createDashboard,
  createHousehold,
  createUser,
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
