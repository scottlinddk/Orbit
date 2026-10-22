import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  EgressDeniedError,
  IntegrationError,
  type EgressFetcher,
  type EgressRequest,
} from '@orbit/application'
import { InvariantViolation } from '@orbit/domain'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMealieProvider, MEAL_PLAN_ENTITY } from './provider.ts'

const TOKEN = 'eyJ.fake-mealie-api-token.sig'

interface Seen {
  path: string
  authorization: string | undefined
}

let server: Server
let base: string
let seen: Seen[]
let routes: Map<string, { status: number; body: string }>

/** A plain fetch against the in-process server, standing in for the egress guard. */
const fetcher: EgressFetcher = {
  async fetchText(request: EgressRequest) {
    const response = await fetch(request.url, {
      headers: request.headers as Record<string, string>,
    })
    return { status: response.status, body: await response.text(), finalUrl: request.url }
  },
}

const provider = () => createMealieProvider(fetcher)
const target = () => ({ baseUrl: base, token: TOKEN })
const json = (value: unknown, status = 200) => ({ status, body: JSON.stringify(value) })

beforeEach(async () => {
  seen = []
  routes = new Map()
  server = createServer((req, res) => {
    const path = req.url ?? ''
    seen.push({ path, authorization: req.headers.authorization })
    const route = routes.get(`${req.method} ${path.split('?')[0]}`)
    res.statusCode = route?.status ?? 404
    res.end(route?.body ?? '')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve))
})

describe('parseAddress', () => {
  const parse = (input: string) => provider().parseAddress(input)

  it('keeps the origin and a path prefix', () => {
    expect(parse(' http://mealie.local:9000/ ')).toEqual({
      url: 'http://mealie.local:9000',
      host: 'mealie.local:9000',
    })
    expect(parse('https://home.example.com/mealie/?x=1').url).toBe(
      'https://home.example.com/mealie',
    )
  })

  it('refuses addresses without a scheme, other schemes and credentials', () => {
    expect(() => parse('mealie.local:9000')).toThrow(InvariantViolation)
    expect(() => parse('ftp://example.com')).toThrow(InvariantViolation)
    expect(() => parse('http://user:pw@example.com')).toThrow(/user name/)
  })
})

describe('discover', () => {
  const login = () => {
    routes.set('GET /api/app/about', json({ version: 'v2.8.0' }))
    routes.set('GET /api/users/self', json({ id: 'u1' }))
  }

  it('offers the meal plan and each shopping list, sending the token as a bearer header', async () => {
    login()
    routes.set(
      'GET /api/households/shopping/lists',
      json({
        items: [
          { id: '7f3c1d2e-aaaa-bbbb-cccc-0123456789ab', name: 'Weekly shop' },
          { id: 'not a valid id!', name: 'Dropped' },
        ],
      }),
    )
    const found = await provider().discover(target())
    expect(found).toEqual([
      { entityId: MEAL_PLAN_ENTITY, role: 'meals', name: 'Meal plan' },
      {
        entityId: 'shoppinglist.7f3c1d2e-aaaa-bbbb-cccc-0123456789ab',
        role: 'todo',
        name: 'Weekly shop',
      },
    ])
    const authenticated = seen.filter((s) => !s.path.startsWith('/api/app/about'))
    expect(authenticated.every((s) => s.authorization === `Bearer ${TOKEN}`)).toBe(true)
  })

  it('accepts a nightly build and refuses Mealie 1', async () => {
    routes.set('GET /api/app/about', json({ version: 'nightly' }))
    routes.set('GET /api/users/self', json({ id: 'u1' }))
    await expect(provider().discover(target())).resolves.toHaveLength(1)
    routes.set('GET /api/app/about', json({ version: 'v1.12.0' }))
    await expect(provider().discover(target())).rejects.toThrow(/older than version 2/)
  })

  it('reports a refused token without repeating it or the address', async () => {
    routes.set('GET /api/app/about', json({ version: 'v2.0.0' }))
    routes.set('GET /api/users/self', { status: 401, body: '{"detail":"Unauthorized"}' })
    const error = await provider()
      .discover(target())
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(IntegrationError)
    expect((error as Error).message).toMatch(/refused the API token/)
    expect((error as Error).message).not.toContain(TOKEN)
    expect((error as Error).message).not.toContain('127.0.0.1')
  })

  it('explains an answer that is not Mealie', async () => {
    routes.set('GET /api/app/about', { status: 200, body: '<html>nope</html>' })
    await expect(provider().discover(target())).rejects.toThrow(/did not answer with JSON/)
  })

  it('tells the operator how to allow a private address', async () => {
    const blocked: EgressFetcher = {
      fetchText: async () => {
        throw new EgressDeniedError('blocked-address', 'That address is not allowed.')
      },
    }
    await expect(createMealieProvider(blocked).discover(target())).rejects.toThrow(
      /ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS/,
    )
  })
})

describe('readMealPlan', () => {
  const range = { from: '2026-10-19', to: '2026-10-25' }

  it('maps entries and asks for the dates it needs', async () => {
    routes.set(
      'GET /api/households/mealplans',
      json({
        page: 1,
        per_page: 200,
        total: 4,
        total_pages: 1,
        items: [
          {
            id: 'e1',
            date: '2026-10-22',
            entryType: 'dinner',
            title: '',
            text: '',
            recipeId: 'r1',
            recipe: { id: 'r1', slug: 'chili-sin-carne', name: 'Chili sin carne' },
          },
          {
            id: 'e2',
            date: '2026-10-22',
            entryType: 'lunch',
            title: 'Leftovers',
            text: 'From Tuesday',
          },
          { id: 'e3', date: '2026-10-23', entryType: 'brunch', title: 'Pancakes' },
          { id: 'e4', date: 'garbage', entryType: 'dinner', title: 'Dropped' },
        ],
      }),
    )
    const entries = await provider().readMealPlan!(target(), MEAL_PLAN_ENTITY, range)
    expect(entries).toEqual([
      {
        id: 'e1',
        date: '2026-10-22',
        type: 'dinner',
        title: 'Chili sin carne',
        recipe: { ref: 'chili-sin-carne', name: 'Chili sin carne' },
      },
      { id: 'e2', date: '2026-10-22', type: 'lunch', title: 'Leftovers', note: 'From Tuesday' },
      { id: 'e3', date: '2026-10-23', type: 'dinner', title: 'Pancakes' },
    ])
    expect(seen[0]!.path).toContain('start_date=2026-10-19&end_date=2026-10-25')
  })

  it('follows pages', async () => {
    let calls = 0
    server.removeAllListeners('request')
    server.on('request', (req, res) => {
      calls++
      const page = Number(new URL(req.url ?? '', 'http://x').searchParams.get('page'))
      res.end(
        JSON.stringify({
          total_pages: 2,
          items: [
            { id: `p${page}`, date: '2026-10-20', entryType: 'dinner', title: `Meal ${page}` },
          ],
        }),
      )
    })
    const entries = await provider().readMealPlan!(target(), MEAL_PLAN_ENTITY, range)
    expect(entries.map((e) => e.title)).toEqual(['Meal 1', 'Meal 2'])
    expect(calls).toBe(2)
  })

  it('refuses an entity that is not the meal plan', async () => {
    await expect(provider().readMealPlan!(target(), 'shoppinglist.x', range)).rejects.toThrow(
      IntegrationError,
    )
  })
})

describe('readRecipe', () => {
  it('returns ingredients and steps, without any image address', async () => {
    routes.set(
      'GET /api/recipes/chili-sin-carne',
      json({
        name: 'Chili sin carne',
        description: 'Warming.',
        recipeServings: 4,
        image: 'abc123',
        recipeIngredient: [
          { display: '2 cans kidney beans', note: '', quantity: 2 },
          { display: '', note: 'Salt to taste' },
          { display: '' },
        ],
        recipeInstructions: [{ text: 'Chop.' }, { text: 'Simmer.' }, { title: 'no text' }],
      }),
    )
    const recipe = await provider().readRecipe!(target(), 'chili-sin-carne')
    expect(recipe).toEqual({
      ref: 'chili-sin-carne',
      name: 'Chili sin carne',
      description: 'Warming.',
      servings: 4,
      ingredients: ['2 cans kidney beans', 'Salt to taste'],
      instructions: ['Chop.', 'Simmer.'],
    })
    expect(JSON.stringify(recipe)).not.toContain('abc123')
  })

  it('says so when Mealie does not know the recipe', async () => {
    await expect(provider().readRecipe!(target(), 'gone')).rejects.toThrow(/does not know/)
  })
})

describe('readTodoList', () => {
  const entity = 'shoppinglist.7f3c1d2e-aaaa-bbbb-cccc-0123456789ab'

  it('maps shopping list items', async () => {
    routes.set(
      'GET /api/households/shopping/lists/7f3c1d2e-aaaa-bbbb-cccc-0123456789ab',
      json({
        name: 'Weekly shop',
        listItems: [
          { id: 'i1', display: '2 kg flour', note: '', checked: false },
          { id: 'i2', display: 'Milk', note: 'oat', checked: true },
          { id: 'i3', display: '', note: '' },
        ],
      }),
    )
    const list = await provider().readTodoList(target(), entity)
    expect(list.name).toBe('Weekly shop')
    expect(list.items).toEqual([
      { id: 'i1', title: '2 kg flour', completed: false },
      { id: 'i2', title: 'Milk', completed: true, notes: 'oat' },
    ])
  })

  it('refuses ids that could change the request path', async () => {
    await expect(provider().readTodoList(target(), 'shoppinglist.../../x')).rejects.toThrow(
      /does not know/,
    )
    expect(seen).toHaveLength(0)
  })
})
