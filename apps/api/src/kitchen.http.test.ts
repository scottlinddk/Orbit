import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createGuardedFetcher } from '@orbit/adapter-egress-guard'
import { createGrocyProvider } from '@orbit/integration-grocy'
import { createMealieProvider } from '@orbit/integration-mealie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestEnv, type TestClient, type TestEnv } from './test-support.ts'

const V1 = '/api/v1'
const MEALIE_URL = 'http://mealie.local:9000'
const MEALIE_TOKEN = 'mealie-token-very-secret'
const GROCY_URL = 'http://grocy.local:9283'
const GROCY_KEY = 'grocy-key-very-secret'

describe.each(['memory', 'sqlite'] as const)('meals and stock over HTTP (%s)', (storage) => {
  let env: TestEnv
  let alice: TestClient
  let bob: TestClient
  let household: string
  let mealie: string

  beforeEach(async () => {
    env = await createTestEnv({ storage })
    alice = env.client()
    bob = env.client()
    await alice.signUp('alice')
    await bob.signUp('bobby')
    household = (await alice.post(`${V1}/households`, { name: 'Home' })).body.id
    await alice.post(`${V1}/households/${household}/members`, { username: 'bobby' })

    const m = env.mealie.add(MEALIE_URL, MEALIE_TOKEN)
    m.entities.push(
      { entityId: 'mealplan.mealplan', role: 'meals', name: 'Meal plan' },
      { entityId: 'shoppinglist.abc-1', role: 'todo', name: 'Weekly shop' },
    )
    m.mealPlans.set('mealplan.mealplan', [
      {
        id: 'm1',
        date: '2026-01-01',
        type: 'dinner',
        title: 'Chili',
        note: 'Double batch',
        recipe: { ref: 'chili', name: 'Chili sin carne' },
      },
      { id: 'm2', date: '2026-01-02', type: 'lunch', title: 'Leftovers' },
    ])
    m.recipes.set('chili', {
      ref: 'chili',
      name: 'Chili sin carne',
      servings: 4,
      ingredients: ['2 cans beans'],
      instructions: ['Simmer.'],
    })
    m.todos.set('shoppinglist.abc-1', {
      id: 'shoppinglist.abc-1',
      name: 'Weekly shop',
      items: [{ id: 'i1', title: '2 kg flour', completed: false }],
    })
    const g = env.grocy.add(GROCY_URL, GROCY_KEY)
    g.entities.push({ entityId: 'stock.stock', role: 'stock', name: 'Stock overview' })
    g.stock.set('stock.stock', [
      { id: '1', name: 'Yoghurt', status: 'due-soon', amount: 1, bestBefore: '2026-01-04' },
    ])
  })
  afterEach(() => env.close())

  const base = () => `${V1}/households/${household}`

  async function connectBoth() {
    const created = await alice.post(`${base()}/connections`, {
      kind: 'mealie',
      name: 'Mealie',
      url: MEALIE_URL,
      token: MEALIE_TOKEN,
    })
    expect(created.status).toBe(201)
    mealie = created.body.id
    await alice.put(`${base()}/connections/${mealie}/mirrors`, {
      entityIds: ['mealplan.mealplan', 'shoppinglist.abc-1'],
    })
    const grocy = await alice.post(`${base()}/connections`, {
      kind: 'grocy',
      name: 'Grocy',
      url: GROCY_URL,
      token: GROCY_KEY,
    })
    expect(grocy.status).toBe(201)
    await alice.put(`${base()}/connections/${grocy.body.id}/mirrors`, {
      entityIds: ['stock.stock'],
    })
  }

  it('connects, shows the plan, a recipe, the stock and a shopping list to a member', async () => {
    await connectBoth()
    const plan = await bob.get(`${base()}/meals?from=2026-01-01&to=2026-01-07`)
    expect(plan.status).toBe(200)
    expect(plan.body.entries).toEqual([
      {
        id: 'm1',
        date: '2026-01-01',
        type: 'dinner',
        title: 'Chili',
        note: 'Double batch',
        recipe: { connectionId: mealie, ref: 'chili', name: 'Chili sin carne' },
      },
      { id: 'm2', date: '2026-01-02', type: 'lunch', title: 'Leftovers' },
    ])
    expect(plan.body.sources).toMatchObject([{ name: 'Meal plan', ok: true }])

    const recipe = await bob.get(`${base()}/meals/recipes/${mealie}/chili`)
    expect(recipe.status).toBe(200)
    expect(recipe.body).toEqual({
      name: 'Chili sin carne',
      servings: 4,
      ingredients: ['2 cans beans'],
      instructions: ['Simmer.'],
    })

    const stock = await bob.get(`${base()}/stock`)
    expect(stock.body.items).toEqual([
      { id: '1', name: 'Yoghurt', status: 'due-soon', amount: 1, bestBefore: '2026-01-04' },
    ])

    const lists = (await bob.get(`${base()}/lists`)).body.lists
    expect(lists).toMatchObject([{ name: 'Weekly shop', readOnly: true }])
    const change = await bob.post(`${base()}/lists/${lists[0].id}/items`, { text: 'Eggs' })
    expect(change.status).toBe(422)
    expect(change.body.detail).toMatch(/read only/)
  })

  it('refuses a bad range and a recipe the plan does not point to', async () => {
    await connectBoth()
    expect((await bob.get(`${base()}/meals?from=tomorrow`)).status).toBe(400)
    expect((await bob.get(`${base()}/meals?from=2026-01-05&to=2026-01-01`)).status).toBe(422)
    expect((await bob.get(`${base()}/meals?from=2026-01-01&to=2026-03-01`)).status).toBe(422)
    env.mealie.systems.get(MEALIE_URL)!.recipes.set('hidden', {
      ref: 'hidden',
      name: 'Hidden',
      ingredients: [],
      instructions: [],
    })
    expect((await bob.get(`${base()}/meals/recipes/${mealie}/hidden`)).status).toBe(404)
  })

  it('publishes meals.today and stock.expiring on the display feed, titles only', async () => {
    await connectBoth()
    // Warm the cache, as a viewer of the dashboard would.
    await bob.get(`${base()}/meals?from=2026-01-01&to=2026-01-01`)
    await bob.get(`${base()}/stock`)
    const feed = await alice.post(`${base()}/feeds`, {
      name: 'Kitchen',
      fields: ['meals.today', 'stock.expiring'],
    })
    expect(feed.status).toBe(201)
    const read = await env
      .client()
      .get(`${V1}/feed`, { authorization: `Bearer ${feed.body.token}` })
    expect(read.status).toBe(200)
    expect(read.body).toEqual({
      meals: { today: [{ type: 'dinner', title: 'Chili' }] },
      stock: { expiring: [{ name: 'Yoghurt', status: 'due-soon', bestBefore: '2026-01-04' }] },
    })
    expect(JSON.stringify(read.body)).not.toContain('Double batch')
  })

  it('never returns an address or a token, not even in the API description', async () => {
    await connectBoth()
    const everything = JSON.stringify([
      (await alice.get(`${base()}/connections`)).body,
      (await bob.get(`${base()}/meals`)).body,
      (await bob.get(`${base()}/stock`)).body,
      (await env.client().get(`${V1}/openapi.json`)).body,
    ])
    for (const secret of [MEALIE_URL, MEALIE_TOKEN, GROCY_URL, GROCY_KEY])
      expect(everything).not.toContain(secret)
  })

  it('is for signed-in members of the household only', async () => {
    await connectBoth()
    const stranger = env.client()
    await stranger.signUp('carol')
    const anon = env.client()
    expect((await anon.get(`${base()}/meals`)).status).toBe(401)
    expect((await stranger.get(`${base()}/meals`)).status).toBe(404)
    expect((await stranger.get(`${base()}/stock`)).status).toBe(404)
    expect((await stranger.get(`${base()}/meals/recipes/${mealie}/chili`)).status).toBe(404)
  })
})

describe('Mealie and Grocy through the real providers and egress guard', () => {
  let server: Server
  let address: string
  let env: TestEnv | undefined
  let seen: { path: string; authorization?: string | undefined; grocy?: string | undefined }[]

  beforeEach(async () => {
    seen = []
    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://x')
      seen.push({
        path: url.pathname,
        authorization: req.headers.authorization,
        grocy: req.headers['grocy-api-key'] as string | undefined,
      })
      res.setHeader('content-type', 'application/json')
      const json = (value: unknown) => res.end(JSON.stringify(value))
      switch (url.pathname) {
        case '/api/app/about':
          return json({ version: 'v2.8.0' })
        case '/api/users/self':
          return json({ id: 'u1' })
        case '/api/households/shopping/lists':
          return json({ items: [] })
        case '/api/households/mealplans':
          return json({
            total_pages: 1,
            items: [
              {
                id: 'e1',
                date: '2026-01-01',
                entryType: 'dinner',
                title: '',
                recipe: { slug: 'chili', name: 'Chili' },
              },
            ],
          })
        case '/api/recipes/chili':
          return json({
            name: 'Chili',
            recipeIngredient: [{ display: '2 cans beans' }],
            recipeInstructions: [{ text: 'Simmer.' }],
          })
        case '/api/system/info':
          return json({ grocy_version: { Version: '4.7.1' } })
        case '/api/objects/shopping_lists':
          return json([])
        case '/api/stock/volatile':
          return json({
            due_products: [
              {
                product_id: '2',
                amount: '1',
                best_before_date: '2026-01-04',
                product: { name: 'Yoghurt' },
              },
            ],
            overdue_products: [],
            expired_products: [],
            missing_products: [],
          })
        default:
          res.statusCode = 404
          return res.end('{}')
      }
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    address = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterEach(async () => {
    await env?.close()
    await new Promise((resolve) => server.close(resolve))
  })

  async function setup(allowPrivate: string[]) {
    const fetcher = createGuardedFetcher({ allowPrivateHosts: new Set(allowPrivate) })
    env = await createTestEnv({
      connectionProviders: [createMealieProvider(fetcher), createGrocyProvider(fetcher)],
    })
    const owner = env.client()
    await owner.signUp('olga')
    const home = (await owner.post(`${V1}/households`, { name: 'H' })).body.id
    return { owner, home }
  }

  it('refuses a private address unless the operator allowed that host, for both kinds', async () => {
    const { owner, home } = await setup([])
    for (const kind of ['mealie', 'grocy'] as const) {
      const res = await owner.post(`${V1}/households/${home}/connections`, {
        kind,
        name: kind,
        url: address,
        token: 'secret-credential',
      })
      expect(res.status).toBe(422)
      expect(res.body.detail).toMatch(/ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS/)
      expect(JSON.stringify(res.body)).not.toContain('secret-credential')
    }
    expect(seen).toEqual([])
  })

  it('reads a Mealie plan and recipe with the token as a bearer header', async () => {
    const { owner, home } = await setup(['127.0.0.1'])
    const created = await owner.post(`${V1}/households/${home}/connections`, {
      kind: 'mealie',
      name: 'Mealie',
      url: address,
      token: MEALIE_TOKEN,
    })
    expect(created.status).toBe(201)
    await owner.put(`${V1}/households/${home}/connections/${created.body.id}/mirrors`, {
      entityIds: ['mealplan.mealplan'],
    })
    const plan = await owner.get(`${V1}/households/${home}/meals?from=2026-01-01&to=2026-01-07`)
    expect(plan.body.entries).toMatchObject([{ title: 'Chili', recipe: { ref: 'chili' } }])
    const recipe = await owner.get(
      `${V1}/households/${home}/meals/recipes/${created.body.id}/chili`,
    )
    expect(recipe.body).toMatchObject({ ingredients: ['2 cans beans'] })
    const authenticated = seen.filter((s) => s.path !== '/api/app/about')
    expect(authenticated.length).toBeGreaterThan(0)
    expect(authenticated.every((s) => s.authorization === `Bearer ${MEALIE_TOKEN}`)).toBe(true)
  })

  it('reads Grocy stock with the key in its own header', async () => {
    const { owner, home } = await setup(['127.0.0.1'])
    const created = await owner.post(`${V1}/households/${home}/connections`, {
      kind: 'grocy',
      name: 'Grocy',
      url: address,
      token: GROCY_KEY,
    })
    expect(created.status).toBe(201)
    await owner.put(`${V1}/households/${home}/connections/${created.body.id}/mirrors`, {
      entityIds: ['stock.stock'],
    })
    const stock = await owner.get(`${V1}/households/${home}/stock`)
    expect(stock.body.items).toMatchObject([{ name: 'Yoghurt', status: 'due-soon' }])
    expect(seen.every((s) => s.grocy === GROCY_KEY && s.authorization === undefined)).toBe(true)
  })
})
