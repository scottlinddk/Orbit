import {
  EgressDeniedError,
  IntegrationError,
  type ConnectionTarget,
  type DiscoveredEntity,
  type EgressFetcher,
  type IntegrationProvider,
} from '@orbit/application'
import {
  InvariantViolation,
  invariant,
  isPlainDate,
  type ListItem,
  type StockItem,
  type StockStatus,
  type TodoList,
} from '@orbit/domain'

const TIMEOUT_MS = 15_000
const MAX_SMALL_BYTES = 512 * 1024
const MAX_ROWS_BYTES = 4 * 1024 * 1024
export const MAX_ITEMS_PER_LIST = 1000
export const MAX_STOCK_ITEMS = 200
/** How many days ahead "due soon" looks. */
const DUE_SOON_DAYS = 7
/** Grocy stores "never expires" as this date. */
const NEVER = '2999-12-31'

/** The one stock overview of a Grocy installation. */
export const STOCK_ENTITY = 'stock.stock'
const LIST_PREFIX = 'shoppinglist.'
/** Orbit is checked against Grocy 4 (its API description reported 4.7.1). */
const MIN_MAJOR = 4

type Json = unknown
const isObject = (value: Json): value is Record<string, Json> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: Json, max: number): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, max) : undefined
/** Grocy returns many numbers as strings. */
const num = (value: Json): number | undefined => {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

/**
 * Reads shopping lists and a stock overview from Grocy's REST API (ADR 0021). Every request goes
 * through the egress guard, is limited to the host the owner typed, and carries the API key in
 * the `GROCY-API-KEY` header only. Error messages never contain the key or the address.
 */
export function createGrocyProvider(fetcher: EgressFetcher): IntegrationProvider {
  async function call(
    target: ConnectionTarget,
    path: string,
    maxBytes: number,
  ): Promise<{ status: number; json: Json }> {
    const hostname = new URL(target.baseUrl).hostname
    let response
    try {
      response = await fetcher.fetchText({
        url: `${target.baseUrl}${path}`,
        maxBytes,
        timeoutMs: TIMEOUT_MS,
        allowedHosts: [hostname],
        headers: { 'grocy-api-key': target.token, accept: 'application/json' },
      })
    } catch (error) {
      if (error instanceof EgressDeniedError && error.reason === 'blocked-address')
        throw new IntegrationError(
          'Grocy is on a private network address. Whoever runs this server must list its host name in ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS.',
        )
      throw error
    }
    if (response.status === 401 || response.status === 403)
      throw new IntegrationError(
        'Grocy refused the API key. Create a new API key in Grocy under "Manage API keys" and try again.',
      )
    if (response.status === 404) return { status: 404, json: null }
    if (response.status < 200 || response.status >= 300)
      throw new IntegrationError(`Grocy answered with status ${response.status}.`)
    try {
      return { status: response.status, json: JSON.parse(response.body) as Json }
    } catch {
      throw new IntegrationError(
        'Grocy did not answer with JSON. Check the address: it should be the one you open Grocy at.',
      )
    }
  }

  return {
    kind: 'grocy',

    parseAddress(input) {
      const trimmed = input.trim()
      invariant(trimmed.length > 0 && trimmed.length <= 2000, 'Enter the Grocy address')
      let parsed: URL
      try {
        parsed = new URL(trimmed)
      } catch {
        throw new InvariantViolation(
          'That is not a valid address. Include http:// or https://, for example http://grocy.local:9283',
        )
      }
      invariant(
        parsed.protocol === 'https:' || parsed.protocol === 'http:',
        'The address must start with http:// or https://',
      )
      invariant(
        parsed.username === '' && parsed.password === '',
        'Remove the user name and password from the address',
      )
      return { url: `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`, host: parsed.host }
    },

    async discover(target) {
      // This needs a valid key, so it also proves the credential before anything else.
      const info = await call(target, '/api/system/info', MAX_SMALL_BYTES)
      if (!isObject(info.json) || !isObject(info.json.grocy_version))
        throw new IntegrationError(
          'That does not look like Grocy. Check the address: it should be the one you open Grocy at.',
        )
      const version = text(info.json.grocy_version.Version, 40)
      const major = version === undefined ? undefined : /^(\d+)\./.exec(version)?.[1]
      if (major !== undefined && Number(major) < MIN_MAJOR)
        throw new IntegrationError(
          `This Grocy is version ${version}. Orbit is checked against Grocy ${MIN_MAJOR}, so update Grocy first.`,
        )
      const found: DiscoveredEntity[] = [
        { entityId: STOCK_ENTITY, role: 'stock', name: 'Stock overview' },
      ]
      const lists = await call(target, '/api/objects/shopping_lists', MAX_SMALL_BYTES)
      if (Array.isArray(lists.json)) {
        for (const entry of lists.json) {
          if (!isObject(entry)) continue
          const id = num(entry.id)
          if (id === undefined || !Number.isInteger(id) || id < 0) continue
          found.push({
            entityId: `${LIST_PREFIX}${id}`,
            role: 'todo',
            name: text(entry.name, 80) ?? 'Shopping list',
          })
        }
      }
      return found
    },

    async readCalendar() {
      throw new IntegrationError('Grocy has no calendars.')
    },

    async readTodoList(target, entityId): Promise<TodoList> {
      const id = entityId.startsWith(LIST_PREFIX)
        ? Number(entityId.slice(LIST_PREFIX.length))
        : Number.NaN
      if (!Number.isInteger(id) || id < 0)
        throw new IntegrationError('Grocy does not know that list any more.')
      const lists = await call(target, '/api/objects/shopping_lists', MAX_SMALL_BYTES)
      const name = Array.isArray(lists.json)
        ? lists.json.flatMap((l) => (isObject(l) && num(l.id) === id ? [text(l.name, 80)] : []))[0]
        : undefined
      const rows = await call(target, '/api/objects/shopping_list', MAX_ROWS_BYTES)
      if (!Array.isArray(rows.json))
        throw new IntegrationError('Grocy did not return the items of that list.')
      const products = await call(target, '/api/objects/products', MAX_ROWS_BYTES)
      const names = new Map<number, string>()
      if (Array.isArray(products.json))
        for (const p of products.json) {
          const pid = isObject(p) ? num(p.id) : undefined
          const pname = isObject(p) ? text(p.name, 200) : undefined
          if (pid !== undefined && pname !== undefined) names.set(pid, pname)
        }
      const items = rows.json
        .filter((r) => isObject(r) && (num(r.shopping_list_id) ?? 1) === id)
        .slice(0, MAX_ITEMS_PER_LIST)
        .flatMap((r, i) => {
          const item = toListItem(r, i, names)
          return item ? [item] : []
        })
      return { id: entityId, name: name ?? 'Shopping list', items }
    },

    async readStock(target, entityId): Promise<StockItem[]> {
      if (entityId !== STOCK_ENTITY) throw new IntegrationError('Grocy does not know that view.')
      const { json } = await call(
        target,
        `/api/stock/volatile?due_soon_days=${DUE_SOON_DAYS}`,
        MAX_ROWS_BYTES,
      )
      if (!isObject(json)) throw new IntegrationError('Grocy did not return the stock.')
      const items: StockItem[] = []
      const seen = new Set<string>()
      const add = (item: StockItem | undefined) => {
        if (!item || seen.has(`${item.id}:${item.status}`)) return
        seen.add(`${item.id}:${item.status}`)
        items.push(item)
      }
      // The most urgent group first, so the cap drops the least urgent items.
      for (const [key, status] of [
        ['expired_products', 'expired'],
        ['overdue_products', 'overdue'],
        ['due_products', 'due-soon'],
      ] as const)
        if (Array.isArray(json[key])) for (const raw of json[key]) add(toStockItem(raw, status))
      if (Array.isArray(json.missing_products))
        for (const raw of json.missing_products) add(toMissingItem(raw))
      return items.slice(0, MAX_STOCK_ITEMS)
    },
  }
}

/** One row of the shopping list. Grocy stores the product as an id, so the names are joined in. */
export function toListItem(
  raw: Json,
  index: number,
  names: ReadonlyMap<number, string>,
): ListItem | undefined {
  if (!isObject(raw)) return undefined
  const productId = num(raw.product_id)
  const note = text(raw.note, 500)
  const name = (productId === undefined ? undefined : names.get(productId)) ?? note
  if (name === undefined) return undefined
  const amount = num(raw.amount)
  const title = amount !== undefined && amount !== 1 ? `${amount} × ${name}` : name
  const id = num(raw.id)
  return {
    id: id === undefined ? `${index}:${name}` : `${id}`,
    title: title.slice(0, 200),
    completed: raw.done === 1 || raw.done === '1' || raw.done === true,
    ...(note === undefined || note === name ? {} : { notes: note }),
  }
}

const bestBefore = (value: Json): string | undefined => {
  const date = typeof value === 'string' ? value.slice(0, 10) : ''
  return isPlainDate(date) && date !== NEVER ? date : undefined
}

/** An entry of `due_products`, `overdue_products` or `expired_products`. */
export function toStockItem(raw: Json, status: StockStatus): StockItem | undefined {
  if (!isObject(raw)) return undefined
  const id = num(raw.product_id)
  const product = isObject(raw.product) ? raw.product : {}
  const name = text(product.name, 200)
  if (id === undefined || name === undefined) return undefined
  const date = bestBefore(raw.best_before_date)
  return {
    id: `${id}`,
    name,
    status,
    amount: num(raw.amount) ?? 0,
    ...(date === undefined ? {} : { bestBefore: date }),
  }
}

/** An entry of `missing_products`: below the minimum stock the owner set. */
export function toMissingItem(raw: Json): StockItem | undefined {
  if (!isObject(raw)) return undefined
  const id = num(raw.id)
  const name = text(raw.name, 200)
  if (id === undefined || name === undefined) return undefined
  return { id: `${id}`, name, status: 'missing', amount: num(raw.amount_missing) ?? 0 }
}
