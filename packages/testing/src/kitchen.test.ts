import { ForbiddenError, NotFoundError, type Actor } from '@orbit/application'
import {
  ConnectionId,
  InvariantViolation,
  type Connection,
  type HouseholdId,
  type ListId,
  type MealPlanEntry,
  type MealRecipe,
  type StockItem,
} from '@orbit/domain'
import { beforeEach, describe, expect, it } from 'vitest'
import { createInMemorySystem, createSqliteSystem, type TestSystem } from './fixtures.ts'
import type { FakeSystem } from './integration-fakes.ts'

const MEALIE_URL = 'http://mealie.local:9000'
const MEALIE_TOKEN = 'mealie-token-very-secret'
const GROCY_URL = 'http://grocy.local:9283'
const GROCY_KEY = 'grocy-key-very-secret'
const MINUTE = 60 * 1000
/** The fixture clock starts on this day. */
const TODAY = '2026-01-01'

async function failure(call: Promise<unknown>): Promise<string> {
  try {
    await call
  } catch (error) {
    return (error as Error).message
  }
  return 'did not fail'
}

const meal = (over: Partial<MealPlanEntry> & { id: string }): MealPlanEntry => ({
  date: TODAY,
  type: 'dinner',
  title: 'Soup',
  ...over,
})

const chili: MealRecipe = {
  ref: 'chili',
  name: 'Chili sin carne',
  servings: 4,
  ingredients: ['2 cans beans', '1 onion'],
  instructions: ['Chop.', 'Simmer.'],
}

describe.each([
  ['in-memory', createInMemorySystem],
  ['sqlite', createSqliteSystem],
])('meals and stock: %s', (_name, create) => {
  let sys: TestSystem
  let alice: Actor
  let bob: Actor
  let kiosk: Actor
  let carol: Actor
  let household: HouseholdId
  let mealie: FakeSystem
  let grocy: FakeSystem

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

    mealie = sys.mealie.add(MEALIE_URL, MEALIE_TOKEN)
    mealie.entities.push(
      { entityId: 'mealplan.mealplan', role: 'meals', name: 'Meal plan' },
      { entityId: 'shoppinglist.abc-1', role: 'todo', name: 'Weekly shop' },
    )
    mealie.mealPlans.set('mealplan.mealplan', [
      meal({ id: 'm1', title: 'Chili', recipe: { ref: 'chili', name: 'Chili sin carne' } }),
      meal({ id: 'm2', type: 'breakfast', title: 'Oats', note: 'with honey' }),
      meal({ id: 'm3', date: '2026-01-03', title: 'Pasta' }),
    ])
    mealie.recipes.set('chili', chili)
    mealie.recipes.set('secret-recipe', { ...chili, ref: 'secret-recipe', name: 'Not planned' })
    mealie.todos.set('shoppinglist.abc-1', {
      id: 'shoppinglist.abc-1',
      name: 'Weekly shop',
      items: [{ id: 'i1', title: '2 kg flour', completed: false }],
    })

    grocy = sys.grocy.add(GROCY_URL, GROCY_KEY)
    grocy.entities.push(
      { entityId: 'stock.stock', role: 'stock', name: 'Stock overview' },
      { entityId: 'shoppinglist.1', role: 'todo', name: 'Shopping list' },
    )
    const items: StockItem[] = [
      { id: '1', name: 'Yoghurt', status: 'due-soon', amount: 1, bestBefore: '2026-01-04' },
      { id: '2', name: 'Cheese', status: 'expired', amount: 2, bestBefore: '2025-12-20' },
    ]
    grocy.stock.set('stock.stock', items)
    grocy.todos.set('shoppinglist.1', {
      id: 'shoppinglist.1',
      name: 'Shopping list',
      items: [{ id: '10', title: '3 × Screws', completed: false }],
    })
  })

  const addMealie = async (): Promise<Connection> => {
    const connection = await sys.connections.addConnection(alice, household, {
      kind: 'mealie',
      name: 'Mealie',
      url: MEALIE_URL,
      token: MEALIE_TOKEN,
    })
    return sys.connections.setMirrors(alice, household, connection.id, ['mealplan.mealplan'])
  }

  const addGrocy = async (): Promise<Connection> => {
    const connection = await sys.connections.addConnection(alice, household, {
      kind: 'grocy',
      name: 'Grocy',
      url: GROCY_URL,
      token: GROCY_KEY,
    })
    return sys.connections.setMirrors(alice, household, connection.id, ['stock.stock'])
  }

  describe('meal plan', () => {
    it('shows the planned meals to every viewer, oldest first, with the recipe link', async () => {
      const connection = await addMealie()
      for (const who of [alice, bob, kiosk]) {
        const { entries, sources } = await sys.connections.mealPlan(who, household, {
          from: TODAY,
          to: '2026-01-07',
        })
        expect(entries.map((e) => e.title)).toEqual(['Chili', 'Oats', 'Pasta'])
        expect(entries[0]).toMatchObject({
          connectionId: connection.id,
          recipe: { ref: 'chili', name: 'Chili sin carne' },
        })
        expect(sources).toMatchObject([{ name: 'Meal plan', ok: true }])
      }
    })

    it('defaults to a week from today and keeps only the dates asked for', async () => {
      await addMealie()
      const week = await sys.connections.mealPlan(bob, household, {})
      expect(week.entries).toHaveLength(3)
      const one = await sys.connections.mealPlan(bob, household, { from: TODAY, to: TODAY })
      expect(one.entries.map((e) => e.id)).toEqual(['m1', 'm2'])
    })

    it('refuses ranges that are not dates, are backwards, or too long', async () => {
      await addMealie()
      for (const range of [
        { from: 'tomorrow' },
        { from: TODAY, to: '2025-12-31' },
        { from: TODAY, to: '2026-03-01' },
      ])
        await expect(sys.connections.mealPlan(bob, household, range)).rejects.toBeInstanceOf(
          InvariantViolation,
        )
    })

    it('says there is nothing when nothing is connected', async () => {
      expect(await sys.connections.mealPlan(bob, household, {})).toEqual({
        entries: [],
        sources: [],
      })
    })

    it('reads each plan at most once per TTL and covers a wider range with a new read', async () => {
      await addMealie()
      const reads = () => sys.mealie.calls.filter((c) => c.startsWith('meals:')).length
      await sys.connections.mealPlan(bob, household, { from: TODAY, to: '2026-01-07' })
      await sys.connections.mealPlan(alice, household, { from: TODAY, to: '2026-01-07' })
      await sys.connections.mealPlan(alice, household, { from: TODAY, to: '2026-01-03' })
      expect(reads()).toBe(1)
      await sys.connections.mealPlan(alice, household, { from: TODAY, to: '2026-01-14' })
      expect(reads()).toBe(2)
      sys.clock.advance(6 * MINUTE)
      await sys.connections.mealPlan(alice, household, { from: TODAY, to: '2026-01-14' })
      expect(reads()).toBe(3)
    })

    it('keeps the last good plan when a refresh fails, and says so without the address', async () => {
      await addMealie()
      await sys.connections.mealPlan(bob, household, {})
      mealie.mealPlans.set('mealplan.mealplan', new Error(`boom at ${MEALIE_URL}`))
      sys.clock.advance(6 * MINUTE)
      const after = await sys.connections.mealPlan(bob, household, {})
      expect(after.entries).toHaveLength(3)
      expect(after.sources[0]).toMatchObject({ ok: false })
      expect(JSON.stringify(after)).not.toContain(MEALIE_URL)
      expect(JSON.stringify(after)).not.toContain(MEALIE_TOKEN)
    })

    it("is invisible to another household, which gets the answer for a household it isn't in", async () => {
      await addMealie()
      const foreign = await failure(sys.connections.mealPlan(carol, household, {}))
      const missing = await failure(sys.connections.mealPlan(carol, 'nope' as HouseholdId, {}))
      expect(foreign).toBe(missing)
      const elsewhere = (await sys.useCases.listHouseholds(carol))[0]!.id
      expect((await sys.connections.mealPlan(carol, elsewhere, {})).entries).toEqual([])
    })

    it('stops showing the plan when the mirror or the connection is removed', async () => {
      const connection = await addMealie()
      await sys.connections.setMirrors(alice, household, connection.id, [])
      expect((await sys.connections.mealPlan(bob, household, {})).entries).toEqual([])
      await sys.connections.setMirrors(alice, household, connection.id, ['mealplan.mealplan'])
      expect((await sys.connections.mealPlan(bob, household, {})).entries).toHaveLength(3)
      await sys.connections.removeConnection(alice, household, connection.id)
      expect((await sys.connections.mealPlan(bob, household, {})).entries).toEqual([])
    })
  })

  describe('recipes', () => {
    it('opens a recipe that a planned meal points to, for any viewer', async () => {
      const connection = await addMealie()
      for (const who of [alice, bob, kiosk])
        expect(await sys.connections.recipe(who, household, connection.id, 'chili')).toEqual(chili)
    })

    it('does not open recipes that the plan does not point to', async () => {
      const connection = await addMealie()
      await expect(
        sys.connections.recipe(bob, household, connection.id, 'secret-recipe'),
      ).rejects.toBeInstanceOf(NotFoundError)
      expect(sys.mealie.calls).not.toContain('recipe:secret-recipe')
    })

    it('refuses refs that could change the request', async () => {
      const connection = await addMealie()
      for (const ref of ['../etc/passwd', 'a/b', '', 'x'.repeat(300)])
        await expect(
          sys.connections.recipe(bob, household, connection.id, ref),
        ).rejects.toBeInstanceOf(NotFoundError)
    })

    it("does not reach another household's connection, with the answer for a missing one", async () => {
      const connection = await addMealie()
      const elsewhere = (await sys.useCases.listHouseholds(carol))[0]!.id
      const foreign = await failure(
        sys.connections.recipe(carol, elsewhere, connection.id, 'chili'),
      )
      const missing = await failure(
        sys.connections.recipe(carol, elsewhere, ConnectionId('nope'), 'chili'),
      )
      expect(foreign).toBe(missing)
    })

    it('reads a recipe once per TTL, and falls back to the old copy when a read fails', async () => {
      const connection = await addMealie()
      await sys.connections.recipe(bob, household, connection.id, 'chili')
      await sys.connections.recipe(alice, household, connection.id, 'chili')
      expect(sys.mealie.calls.filter((c) => c === 'recipe:chili')).toHaveLength(1)
      mealie.recipes.set('chili', new Error(`down at ${MEALIE_URL}`))
      sys.clock.advance(11 * MINUTE)
      // The plan expired as well, and the failed refresh keeps the last good entries.
      expect(await sys.connections.recipe(bob, household, connection.id, 'chili')).toEqual(chili)
    })

    it('explains a failure without the address or the token', async () => {
      const connection = await addMealie()
      mealie.recipes.set('chili', new Error(`down at ${MEALIE_URL} with ${MEALIE_TOKEN}`))
      const message = await failure(sys.connections.recipe(bob, household, connection.id, 'chili'))
      expect(message).toMatch(/could not be read/)
      expect(message).not.toContain(MEALIE_URL)
      expect(message).not.toContain(MEALIE_TOKEN)
    })
  })

  describe('stock', () => {
    it('shows expired, due and missing stock to every viewer', async () => {
      await addGrocy()
      for (const who of [alice, bob, kiosk]) {
        const { items, sources } = await sys.connections.stock(who, household)
        expect(items.map((i) => i.name).sort()).toEqual(['Cheese', 'Yoghurt'])
        expect(sources).toMatchObject([{ name: 'Stock overview', ok: true }])
      }
    })

    it('reads at most once per TTL and keeps the last good stock when a read fails', async () => {
      await addGrocy()
      await sys.connections.stock(bob, household)
      await sys.connections.stock(alice, household)
      expect(sys.grocy.calls.filter((c) => c.startsWith('stock:'))).toHaveLength(1)
      grocy.stock.set('stock.stock', new Error(`boom ${GROCY_URL} ${GROCY_KEY}`))
      sys.clock.advance(6 * MINUTE)
      const after = await sys.connections.stock(bob, household)
      expect(after.items).toHaveLength(2)
      expect(after.sources[0]).toMatchObject({ ok: false })
      expect(JSON.stringify(after)).not.toContain(GROCY_KEY)
      expect(JSON.stringify(after)).not.toContain(GROCY_URL)
    })

    it('is invisible to another household', async () => {
      await addGrocy()
      const elsewhere = (await sys.useCases.listHouseholds(carol))[0]!.id
      expect((await sys.connections.stock(carol, elsewhere)).items).toEqual([])
      const foreign = await failure(sys.connections.stock(carol, household))
      const missing = await failure(sys.connections.stock(carol, 'nope' as HouseholdId))
      expect(foreign).toBe(missing)
    })
  })

  describe('shopping lists from Mealie and Grocy', () => {
    it('appear as read-only external lists, marked with their kind', async () => {
      const m = await addMealie()
      const g = await addGrocy()
      await sys.connections.setMirrors(alice, household, m.id, ['shoppinglist.abc-1'])
      await sys.connections.setMirrors(alice, household, g.id, ['shoppinglist.1'])
      const summaries = await sys.useCases.listLists(bob, household)
      expect(summaries.map((s) => [s.list.name, s.list.source?.kind])).toEqual([
        ['Weekly shop', 'mealie'],
        ['Shopping list', 'grocy'],
      ])
      for (const s of summaries) {
        const id = s.list.id as ListId
        await expect(
          sys.useCases.addListItem(bob, household, id, { text: 'Eggs' }),
        ).rejects.toThrow(/read only/)
        await expect(
          sys.useCases.addListItem(kiosk, household, id, { text: 'Eggs' }),
        ).rejects.toBeInstanceOf(ForbiddenError)
      }
      const grocyList = summaries.find((s) => s.list.source?.kind === 'grocy')!
      const detail = await sys.useCases.getList(kiosk, household, grocyList.list.id as ListId)
      expect(detail.items.map((i) => i.text)).toEqual(['3 × Screws'])
    })
  })

  describe('connections', () => {
    it('offers the new kinds and counts what a test finds', async () => {
      const m = await sys.connections.addConnection(alice, household, {
        kind: 'mealie',
        name: 'Mealie',
        url: MEALIE_URL,
        token: MEALIE_TOKEN,
      })
      expect(await sys.connections.test(alice, household, m.id)).toEqual({
        ok: true,
        calendars: 0,
        todoLists: 1,
        mealPlans: 1,
        stockViews: 0,
      })
    })

    it('keeps the credentials out of everything it returns, for both kinds', async () => {
      const m = await addMealie()
      const g = await addGrocy()
      const everything = JSON.stringify([
        m,
        g,
        await sys.connections.listConnections(alice, household),
        await sys.connections.discover(alice, household, m.id),
        await sys.connections.mealPlan(bob, household, {}),
        await sys.connections.stock(bob, household),
      ])
      for (const secret of [MEALIE_TOKEN, MEALIE_URL, GROCY_KEY, GROCY_URL])
        expect(everything).not.toContain(secret)
    })

    it('is for owners only', async () => {
      await expect(
        sys.connections.addConnection(bob, household, {
          kind: 'grocy',
          name: 'Grocy',
          url: GROCY_URL,
          token: GROCY_KEY,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError)
    })
  })

  describe('display feed', () => {
    it('fills meals.today and stock.expiring from the cache without waiting, titles only', async () => {
      await addMealie()
      await addGrocy()
      const { token } = await sys.useCases.createFeed(alice, household, {
        name: 'Kitchen',
        fields: ['meals.today', 'stock.expiring'],
      })
      const first = await sys.feedReader.read(token)
      expect(first).toEqual({ meals: { today: [] }, stock: { expiring: [] } })
      await new Promise((resolve) => setTimeout(resolve, 0))
      await new Promise((resolve) => setTimeout(resolve, 0))
      const second = await sys.feedReader.read(token)
      expect(second).toEqual({
        meals: {
          today: [
            { type: 'breakfast', title: 'Oats' },
            { type: 'dinner', title: 'Chili' },
          ],
        },
        stock: {
          expiring: [
            { name: 'Cheese', status: 'expired', bestBefore: '2025-12-20' },
            { name: 'Yoghurt', status: 'due-soon', bestBefore: '2026-01-04' },
          ],
        },
      })
      const text = JSON.stringify(second)
      expect(text).not.toContain('honey')
      expect(text).not.toContain('chili')
    })
  })
})
