import { ForbiddenError, IntegrationError, NotFoundError, type Actor } from '@orbit/application'
import {
  ConnectionId,
  InvariantViolation,
  type CalendarEvent,
  type Connection,
  type HouseholdId,
  type ListId,
} from '@orbit/domain'
import { beforeEach, describe, expect, it } from 'vitest'
import { createInMemorySystem, createSqliteSystem, type TestSystem } from './fixtures.ts'
import type { FakeSystem } from './integration-fakes.ts'

const URL = 'http://ha.local:8123'
const TOKEN = 'tok-very-secret-123'
const MINUTE = 60 * 1000
const DAY = { from: new Date('2026-01-01T00:00:00Z'), to: new Date('2026-01-08T00:00:00Z') }

/** The message a call fails with, so two failures can be compared. */
async function failure(call: Promise<unknown>): Promise<string> {
  try {
    await call
  } catch (error) {
    return (error as Error).message
  }
  return 'did not fail'
}

const timed = (id: string, title: string, start: string, end: string): CalendarEvent => ({
  kind: 'timed',
  id,
  title,
  start,
  end,
  isOverride: false,
  isRecurring: false,
})

describe.each([
  ['in-memory', createInMemorySystem],
  ['sqlite', createSqliteSystem],
])('connections: %s', (_name, create) => {
  let sys: TestSystem
  let alice: Actor
  let bob: Actor
  let kiosk: Actor
  let carol: Actor
  let household: HouseholdId
  let ha: FakeSystem

  beforeEach(async () => {
    sys = create()
    alice = await sys.newActor('alice')
    bob = await sys.newActor('bob')
    kiosk = await sys.newActor('kiosk')
    carol = await sys.newActor('carol')
    household = (await sys.useCases.createHousehold(alice, { name: 'Home' })).id
    await sys.useCases.addHouseholdMember(alice, household, { userId: bob.userId })
    await sys.useCases.addHouseholdMember(alice, household, {
      userId: kiosk.userId,
      role: 'device',
    })
    await sys.useCases.createHousehold(carol, { name: 'Elsewhere' })
    ha = sys.integrations.add(URL, TOKEN)
    ha.entities.push(
      { entityId: 'calendar.family', role: 'calendar', name: 'Family' },
      { entityId: 'todo.shopping', role: 'todo', name: 'Shopping' },
      { entityId: 'todo.chores', role: 'todo', name: 'Chores' },
    )
    ha.calendars.set('calendar.family', [
      timed('a', 'Dentist', '2026-01-02T09:00:00.000Z', '2026-01-02T10:00:00.000Z'),
    ])
    ha.todos.set('todo.shopping', {
      id: 'todo.shopping',
      name: 'Shopping',
      items: [
        { id: 'i1', title: 'Milk', completed: false },
        { id: 'i2', title: 'Bread', completed: true, notes: 'Rye' },
      ],
    })
    ha.todos.set('todo.chores', { id: 'todo.chores', name: 'Chores', items: [] })
  })

  const add = (actor = alice) =>
    sys.connections.addConnection(actor, household, {
      kind: 'homeassistant',
      name: 'Home Assistant',
      url: URL,
      token: TOKEN,
    })

  describe('managing', () => {
    it('keeps the address and the token out of everything it returns', async () => {
      const connection = await add()
      expect(connection).toMatchObject({ name: 'Home Assistant', host: 'ha.local:8123' })
      const everything = JSON.stringify([
        connection,
        await sys.connections.listConnections(alice, household),
        await sys.connections.discover(alice, household, connection.id),
        await sys.connections.test(alice, household, connection.id),
      ])
      expect(everything).not.toContain(TOKEN)
      expect(everything).not.toContain(URL)
    })

    it('keeps both secrets in the secret store and removes them with the connection', async () => {
      const connection = await add()
      const scope = `connection:${connection.id}`
      expect(await sys.secrets.get(scope, 'token')).toBe(TOKEN)
      expect(await sys.secrets.get(scope, 'url')).toBe(URL)
      await sys.connections.removeConnection(alice, household, connection.id)
      expect(await sys.secrets.names(scope)).toEqual([])
      expect(await sys.connections.listConnections(alice, household)).toEqual([])
    })

    it('refuses a wrong token and saves nothing, without repeating the token', async () => {
      const error = await sys.connections
        .addConnection(alice, household, {
          kind: 'homeassistant',
          name: 'Bad',
          url: URL,
          token: 'wrong-token-value',
        })
        .catch((e: unknown) => e)
      expect(error).toBeInstanceOf(InvariantViolation)
      expect((error as Error).message).toMatch(/could not be used/)
      expect((error as Error).message).not.toContain('wrong-token-value')
      expect(await sys.connections.listConnections(alice, household)).toEqual([])
    })

    it('refuses an unreachable address and an unknown kind', async () => {
      await expect(
        sys.connections.addConnection(alice, household, {
          kind: 'homeassistant',
          name: 'Nowhere',
          url: 'http://nowhere.local',
          token: TOKEN,
        }),
      ).rejects.toBeInstanceOf(InvariantViolation)
      await expect(
        sys.connections.addConnection(alice, household, {
          kind: 'mealie' as never,
          name: 'M',
          url: URL,
          token: TOKEN,
        }),
      ).rejects.toBeInstanceOf(InvariantViolation)
    })

    it('is for owners only, and a stranger learns nothing', async () => {
      await expect(add(bob)).rejects.toBeInstanceOf(ForbiddenError)
      await expect(add(kiosk)).rejects.toBeInstanceOf(ForbiddenError)
      await expect(add(carol)).rejects.toBeInstanceOf(NotFoundError)
      const connection = await add()
      for (const attempt of [
        () => sys.connections.listConnections(bob, household),
        () => sys.connections.discover(bob, household, connection.id),
        () => sys.connections.setMirrors(bob, household, connection.id, []),
        () => sys.connections.removeConnection(bob, household, connection.id),
      ])
        await expect(attempt()).rejects.toBeInstanceOf(ForbiddenError)
      await expect(sys.connections.listConnections(carol, household)).rejects.toBeInstanceOf(
        NotFoundError,
      )
    })

    it("does not reach another household's connection through its own household", async () => {
      const connection = await add()
      const elsewhere = (await sys.useCases.listHouseholds(carol))[0]!.id
      for (const attempt of [
        () => sys.connections.discover(carol, elsewhere, connection.id),
        () => sys.connections.test(carol, elsewhere, connection.id),
        () => sys.connections.setMirrors(carol, elsewhere, connection.id, []),
        () => sys.connections.removeConnection(carol, elsewhere, connection.id),
      ])
        await expect(attempt()).rejects.toBeInstanceOf(NotFoundError)
      const missing = await failure(
        sys.connections.discover(carol, elsewhere, ConnectionId('nope')),
      )
      const foreign = await failure(sys.connections.discover(carol, elsewhere, connection.id))
      expect(foreign).toBe(missing)
      expect(await sys.connections.listConnections(alice, household)).toHaveLength(1)
    })

    it('limits connections per household', async () => {
      for (let i = 0; i < 5; i++) await add()
      await expect(add()).rejects.toThrow(/at most 5/)
    })

    it('marks what is mirrored and refuses entities that do not exist', async () => {
      const connection = await add()
      await sys.connections.setMirrors(alice, household, connection.id, [
        'calendar.family',
        'todo.shopping',
      ])
      const found = await sys.connections.discover(alice, household, connection.id)
      expect(found.filter((e) => e.mirrored).map((e) => e.entityId)).toEqual([
        'calendar.family',
        'todo.shopping',
      ])
      await expect(
        sys.connections.setMirrors(alice, household, connection.id, ['todo.missing']),
      ).rejects.toThrow(/was not found/)
    })

    it('reports a failing test without throwing', async () => {
      const connection = await add()
      sys.integrations.systems.delete(URL)
      const result = await sys.connections.test(alice, household, connection.id)
      expect(result).toMatchObject({ ok: false, calendars: 0, todoLists: 0 })
      expect(result.error).toBeDefined()
    })
  })

  describe('mirrored calendars', () => {
    let connection: Connection
    const sourceId = () => `${connection.id}:calendar.family`

    beforeEach(async () => {
      connection = await add()
      connection = await sys.connections.setMirrors(alice, household, connection.id, [
        'calendar.family',
      ])
    })

    it('merges into the calendar events, with a named source status, for any viewer', async () => {
      for (const who of [alice, bob, kiosk]) {
        const result = await sys.calendar.events(who, household, DAY)
        expect(result.events).toMatchObject([{ title: 'Dentist', sourceId: sourceId() }])
        expect(result.sources).toMatchObject([{ sourceId: sourceId(), name: 'Family', ok: true }])
      }
    })

    it('shows nothing of it to another household', async () => {
      const elsewhere = (await sys.useCases.listHouseholds(carol))[0]!.id
      const result = await sys.calendar.events(carol, elsewhere, DAY)
      expect(result).toEqual({ events: [], sources: [] })
    })

    it('reads each mirrored calendar at most once per TTL', async () => {
      await sys.calendar.events(alice, household, DAY)
      await sys.calendar.events(bob, household, DAY)
      expect(sys.integrations.calls.filter((c) => c === 'calendar:calendar.family')).toHaveLength(1)
      sys.clock.advance(6 * MINUTE)
      await sys.calendar.events(alice, household, DAY)
      expect(sys.integrations.calls.filter((c) => c === 'calendar:calendar.family')).toHaveLength(2)
    })

    it('keeps the last good events when a refresh fails, and says so', async () => {
      await sys.calendar.events(alice, household, DAY)
      ha.calendars.set(
        'calendar.family',
        new IntegrationError('Home Assistant answered with status 500.'),
      )
      sys.clock.advance(6 * MINUTE)
      const result = await sys.calendar.events(alice, household, DAY)
      expect(result.events).toHaveLength(1)
      expect(result.sources[0]).toMatchObject({
        ok: false,
        error: 'Home Assistant answered with status 500.',
      })
      expect(result.sources[0]!.fetchedAt).not.toBeNull()
    })

    it('stops showing a calendar that is no longer mirrored or whose connection is removed', async () => {
      await sys.calendar.events(alice, household, DAY)
      await sys.connections.setMirrors(alice, household, connection.id, [])
      expect((await sys.calendar.events(alice, household, DAY)).events).toEqual([])
      await sys.connections.setMirrors(alice, household, connection.id, ['calendar.family'])
      await sys.connections.removeConnection(alice, household, connection.id)
      expect(await sys.calendar.events(alice, household, DAY)).toEqual({ events: [], sources: [] })
    })

    it('never makes the display feed wait for the other system', async () => {
      const first = await sys.calendar.cachedEventsForFeed(household)
      expect(first).toEqual([])
      await new Promise((resolve) => setTimeout(resolve, 0))
      const second = await sys.calendar.cachedEventsForFeed(household)
      expect(second.map((e) => e.title)).toEqual(['Dentist'])
    })
  })

  describe('mirrored lists', () => {
    let connection: Connection
    let shoppingId: ListId

    beforeEach(async () => {
      connection = await add()
      connection = await sys.connections.setMirrors(alice, household, connection.id, [
        'todo.shopping',
        'todo.chores',
      ])
      shoppingId = `${connection.id}:todo.shopping` as ListId
      await sys.useCases.createList(alice, household, { name: 'Our own', kind: 'todo' })
    })

    it('appear next to the household lists, marked as coming from elsewhere', async () => {
      const summaries = await sys.useCases.listLists(bob, household)
      expect(summaries.map((s) => s.list.name)).toEqual(['Our own', 'Shopping', 'Chores'])
      const shopping = summaries.find((s) => s.list.id === shoppingId)!
      expect(shopping).toMatchObject({ openCount: 1, itemCount: 2 })
      expect(shopping.list.source).toEqual({ kind: 'homeassistant', connectionId: connection.id })
      expect(summaries[0]!.list.source).toBeUndefined()
    })

    it('can be opened by anyone who may see lists, including a display', async () => {
      for (const who of [alice, bob, kiosk]) {
        const detail = await sys.useCases.getList(who, household, shoppingId)
        expect(detail.list.name).toBe('Shopping')
        expect(detail.items.map((i) => [i.text, i.done, i.note])).toEqual([
          ['Milk', false, undefined],
          ['Bread', true, 'Rye'],
        ])
      }
    })

    it('are read only: every change is refused for those who may edit, and forbidden for the rest', async () => {
      const changes = [
        (who: Actor) => sys.useCases.renameList(who, household, shoppingId, 'New'),
        (who: Actor) => sys.useCases.deleteList(who, household, shoppingId),
        (who: Actor) => sys.useCases.addListItem(who, household, shoppingId, { text: 'Eggs' }),
        (who: Actor) =>
          sys.useCases.updateListItem(who, household, shoppingId, 'i1' as never, { done: true }),
        (who: Actor) => sys.useCases.deleteListItem(who, household, shoppingId, 'i1' as never),
        (who: Actor) => sys.useCases.moveListItem(who, household, shoppingId, 'i1' as never, 0),
        (who: Actor) => sys.useCases.clearCompletedListItems(who, household, shoppingId),
      ]
      for (const change of changes) {
        await expect(change(bob)).rejects.toThrow(/read only/)
        await expect(change(bob)).rejects.toBeInstanceOf(InvariantViolation)
        await expect(change(kiosk)).rejects.toBeInstanceOf(ForbiddenError)
      }
      const detail = await sys.useCases.getList(alice, household, shoppingId)
      expect(detail.items).toHaveLength(2)
    })

    it('are invisible to another household, which gets the answer for a missing list', async () => {
      const elsewhere = (await sys.useCases.listHouseholds(carol))[0]!.id
      expect(await sys.useCases.listLists(carol, elsewhere)).toEqual([])
      const foreign = await failure(sys.useCases.getList(carol, elsewhere, shoppingId))
      const missing = await failure(sys.useCases.getList(carol, elsewhere, 'nope:todo.x' as ListId))
      expect(foreign).toBe('Not found')
      expect(foreign).toBe(missing)
      await expect(
        sys.useCases.addListItem(carol, elsewhere, shoppingId, { text: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundError)
    })

    it('keep their last good items when the other system fails, and say so', async () => {
      await sys.useCases.getList(alice, household, shoppingId)
      ha.todos.set(
        'todo.shopping',
        new IntegrationError('Home Assistant answered with status 500.'),
      )
      sys.clock.advance(2 * MINUTE)
      const detail = await sys.useCases.getList(alice, household, shoppingId)
      expect(detail.items).toHaveLength(2)
      expect(detail.syncError).toBe('Home Assistant answered with status 500.')
      const summary = (await sys.useCases.listLists(alice, household)).find(
        (s) => s.list.id === shoppingId,
      )!
      expect(summary.syncError).toBeDefined()
    })

    it('disappear when the connection is removed', async () => {
      await sys.connections.removeConnection(alice, household, connection.id)
      expect((await sys.useCases.listLists(alice, household)).map((s) => s.list.name)).toEqual([
        'Our own',
      ])
      await expect(sys.useCases.getList(alice, household, shoppingId)).rejects.toBeInstanceOf(
        NotFoundError,
      )
    })
  })
})
