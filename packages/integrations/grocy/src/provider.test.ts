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
import { createGrocyProvider, STOCK_ENTITY } from './provider.ts'

const KEY = 'grocy-key-0123456789abcdef'

interface Seen {
  path: string
  key: string | undefined
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

const provider = () => createGrocyProvider(fetcher)
const target = () => ({ baseUrl: base, token: KEY })
const json = (value: unknown, status = 200) => ({ status, body: JSON.stringify(value) })

beforeEach(async () => {
  seen = []
  routes = new Map()
  server = createServer((req, res) => {
    const path = req.url ?? ''
    seen.push({ path, key: req.headers['grocy-api-key'] as string | undefined })
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
    expect(parse(' http://grocy.local:9283/ ').host).toBe('grocy.local:9283')
    expect(parse('https://home.example.com/grocy/?x=1').url).toBe('https://home.example.com/grocy')
  })

  it('refuses addresses without a scheme and credentials', () => {
    expect(() => parse('grocy.local')).toThrow(InvariantViolation)
    expect(() => parse('http://user:pw@example.com')).toThrow(/user name/)
  })
})

describe('discover', () => {
  const info = (Version = '4.7.1') =>
    json({ grocy_version: { Version, ReleaseDate: '2026-01-01' } })

  it('offers the stock overview and each shopping list, sending the key in its header', async () => {
    routes.set('GET /api/system/info', info())
    routes.set(
      'GET /api/objects/shopping_lists',
      json([
        { id: '1', name: 'Shopping list' },
        { id: '2', name: 'Hardware store' },
      ]),
    )
    const found = await provider().discover(target())
    expect(found).toEqual([
      { entityId: STOCK_ENTITY, role: 'stock', name: 'Stock overview' },
      { entityId: 'shoppinglist.1', role: 'todo', name: 'Shopping list' },
      { entityId: 'shoppinglist.2', role: 'todo', name: 'Hardware store' },
    ])
    expect(seen.every((s) => s.key === KEY)).toBe(true)
  })

  it('refuses a Grocy older than 4', async () => {
    routes.set('GET /api/system/info', info('3.3.2'))
    await expect(provider().discover(target())).rejects.toThrow(/checked against Grocy 4/)
  })

  it('reports a refused key without repeating it or the address', async () => {
    routes.set('GET /api/system/info', {
      status: 401,
      body: '{"error_message":"No valid api key"}',
    })
    const error = await provider()
      .discover(target())
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(IntegrationError)
    expect((error as Error).message).toMatch(/refused the API key/)
    expect((error as Error).message).not.toContain(KEY)
    expect((error as Error).message).not.toContain('127.0.0.1')
  })

  it('explains an answer that is not Grocy', async () => {
    routes.set('GET /api/system/info', json({ hello: 'world' }))
    await expect(provider().discover(target())).rejects.toThrow(/does not look like Grocy/)
  })

  it('tells the operator how to allow a private address', async () => {
    const blocked: EgressFetcher = {
      fetchText: async () => {
        throw new EgressDeniedError('blocked-address', 'That address is not allowed.')
      },
    }
    await expect(createGrocyProvider(blocked).discover(target())).rejects.toThrow(
      /ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS/,
    )
  })
})

describe('readTodoList', () => {
  it('joins product names onto the rows of one list', async () => {
    routes.set('GET /api/objects/shopping_lists', json([{ id: '2', name: 'Hardware store' }]))
    routes.set(
      'GET /api/objects/shopping_list',
      json([
        { id: '10', shopping_list_id: '2', product_id: '5', amount: '3', note: '' },
        { id: '11', shopping_list_id: '2', product_id: null, amount: '1', note: 'Duct tape' },
        { id: '12', shopping_list_id: '1', product_id: '5', amount: '1', note: '' },
        { id: '13', shopping_list_id: '2', product_id: '5', amount: '1', note: 'big', done: '1' },
      ]),
    )
    routes.set('GET /api/objects/products', json([{ id: '5', name: 'Screws' }]))
    const list = await provider().readTodoList(target(), 'shoppinglist.2')
    expect(list.name).toBe('Hardware store')
    expect(list.items).toEqual([
      { id: '10', title: '3 × Screws', completed: false },
      { id: '11', title: 'Duct tape', completed: false },
      { id: '13', title: 'Screws', completed: true, notes: 'big' },
    ])
  })

  it('refuses ids that are not numbers', async () => {
    await expect(provider().readTodoList(target(), 'shoppinglist.x')).rejects.toThrow(
      /does not know/,
    )
    expect(seen).toHaveLength(0)
  })
})

describe('readStock', () => {
  it('lists the most urgent groups first and drops the never-expires date', async () => {
    routes.set(
      'GET /api/stock/volatile',
      json({
        due_products: [
          {
            product_id: '2',
            amount: '1',
            best_before_date: '2026-10-25',
            product: { id: '2', name: 'Yoghurt' },
          },
        ],
        overdue_products: [],
        expired_products: [
          {
            product_id: '3',
            amount: '2',
            best_before_date: '2026-10-01',
            product: { id: '3', name: 'Cheese' },
          },
          {
            product_id: '4',
            amount: '1',
            best_before_date: '2999-12-31',
            product: { id: '4', name: 'Salt' },
          },
        ],
        missing_products: [{ id: '9', name: 'Eggs', amount_missing: '6', is_partly_in_stock: 0 }],
      }),
    )
    const items = await provider().readStock!(target(), STOCK_ENTITY)
    expect(items).toEqual([
      { id: '3', name: 'Cheese', status: 'expired', amount: 2, bestBefore: '2026-10-01' },
      { id: '4', name: 'Salt', status: 'expired', amount: 1 },
      { id: '2', name: 'Yoghurt', status: 'due-soon', amount: 1, bestBefore: '2026-10-25' },
      { id: '9', name: 'Eggs', status: 'missing', amount: 6 },
    ])
    expect(seen[0]!.path).toContain('due_soon_days=7')
  })

  it('refuses another view', async () => {
    await expect(provider().readStock!(target(), 'shoppinglist.1')).rejects.toThrow(
      IntegrationError,
    )
  })
})
