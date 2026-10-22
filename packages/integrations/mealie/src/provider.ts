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
  MAX_MEAL_ENTRIES,
  MAX_RECIPE_LINES,
  invariant,
  isPlainDate,
  normalizeMealType,
  type ListItem,
  type MealPlanEntry,
  type MealRecipe,
  type TodoList,
} from '@orbit/domain'

const TIMEOUT_MS = 15_000
const MAX_SMALL_BYTES = 512 * 1024
const MAX_PLAN_BYTES = 2 * 1024 * 1024
const MAX_RECIPE_BYTES = 1024 * 1024
const MAX_LIST_BYTES = 1024 * 1024
const PLAN_PAGE_SIZE = 200
const MAX_PLAN_PAGES = 3
export const MAX_ITEMS_PER_LIST = 1000

/** The entity ids of what Mealie offers. The meal plan is one thing per connection. */
export const MEAL_PLAN_ENTITY = 'mealplan.mealplan'
const LIST_PREFIX = 'shoppinglist.'

type Json = unknown
const isObject = (value: Json): value is Record<string, Json> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: Json, max: number): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, max) : undefined

/**
 * Reads the meal plan, recipes and shopping lists from Mealie's REST API (ADR 0021). Every
 * request goes through the egress guard, is limited to the host the owner typed, and carries the
 * API token in the `Authorization` header only. Error messages never contain the token or the
 * address.
 *
 * Mealie 2 moved meal plans and shopping lists from `/api/groups/...` to `/api/households/...`.
 * Orbit reads the new paths and refuses a Mealie 1, rather than guessing at the old ones.
 */
export function createMealieProvider(fetcher: EgressFetcher): IntegrationProvider {
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
        headers: { authorization: `Bearer ${target.token}`, accept: 'application/json' },
      })
    } catch (error) {
      if (error instanceof EgressDeniedError && error.reason === 'blocked-address')
        throw new IntegrationError(
          'Mealie is on a private network address. Whoever runs this server must list its host name in ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS.',
        )
      throw error
    }
    if (response.status === 401 || response.status === 403)
      throw new IntegrationError(
        'Mealie refused the API token. Create a new API token in your Mealie user profile and try again.',
      )
    if (response.status === 404) return { status: 404, json: null }
    if (response.status < 200 || response.status >= 300)
      throw new IntegrationError(`Mealie answered with status ${response.status}.`)
    try {
      return { status: response.status, json: JSON.parse(response.body) as Json }
    } catch {
      throw new IntegrationError(
        'Mealie did not answer with JSON. Check the address: it should be the one you open Mealie at.',
      )
    }
  }

  return {
    kind: 'mealie',

    parseAddress(input) {
      const trimmed = input.trim()
      invariant(trimmed.length > 0 && trimmed.length <= 2000, 'Enter the Mealie address')
      let parsed: URL
      try {
        parsed = new URL(trimmed)
      } catch {
        throw new InvariantViolation(
          'That is not a valid address. Include http:// or https://, for example http://mealie.local:9000',
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
      const about = await call(target, '/api/app/about', MAX_SMALL_BYTES)
      if (!isObject(about.json))
        throw new IntegrationError(
          'That does not look like Mealie. Check the address: it should be the one you open Mealie at.',
        )
      refuseOldVersion(about.json.version)
      // The about page needs no login, so an authenticated call proves the token.
      const self = await call(target, '/api/users/self', MAX_SMALL_BYTES)
      if (self.status === 404 || !isObject(self.json))
        throw new IntegrationError('Mealie did not accept the token.')
      const found: DiscoveredEntity[] = [
        { entityId: MEAL_PLAN_ENTITY, role: 'meals', name: 'Meal plan' },
      ]
      const lists = await call(
        target,
        '/api/households/shopping/lists?perPage=100',
        MAX_SMALL_BYTES,
      )
      if (isObject(lists.json) && Array.isArray(lists.json.items)) {
        for (const entry of lists.json.items) {
          if (!isObject(entry)) continue
          const id = text(entry.id, 80)
          if (id === undefined || !/^[a-z0-9-]+$/i.test(id)) continue
          found.push({
            entityId: `${LIST_PREFIX}${id.toLowerCase()}`,
            role: 'todo',
            name: text(entry.name, 80) ?? 'Shopping list',
          })
        }
      }
      return found
    },

    async readCalendar() {
      throw new IntegrationError('Mealie has no calendars.')
    },

    async readTodoList(target, entityId): Promise<TodoList> {
      if (!entityId.startsWith(LIST_PREFIX))
        throw new IntegrationError('Mealie does not know that list any more.')
      const id = entityId.slice(LIST_PREFIX.length)
      if (!/^[a-z0-9-]+$/.test(id))
        throw new IntegrationError('Mealie does not know that list any more.')
      const { json } = await call(
        target,
        `/api/households/shopping/lists/${encodeURIComponent(id)}`,
        MAX_LIST_BYTES,
      )
      if (!isObject(json) || !Array.isArray(json.listItems))
        throw new IntegrationError('Mealie did not return the items of that list.')
      const items = json.listItems.slice(0, MAX_ITEMS_PER_LIST).flatMap((raw, i) => {
        const item = toListItem(raw, i)
        return item ? [item] : []
      })
      return { id: entityId, name: text(json.name, 80) ?? 'Shopping list', items }
    },

    async readMealPlan(target, entityId, range): Promise<MealPlanEntry[]> {
      if (entityId !== MEAL_PLAN_ENTITY)
        throw new IntegrationError('Mealie does not know that meal plan.')
      const entries: MealPlanEntry[] = []
      for (let page = 1; page <= MAX_PLAN_PAGES; page++) {
        const query =
          `start_date=${range.from}&end_date=${range.to}` +
          `&orderBy=date&orderDirection=asc&perPage=${PLAN_PAGE_SIZE}&page=${page}`
        const { json } = await call(target, `/api/households/mealplans?${query}`, MAX_PLAN_BYTES)
        if (!isObject(json) || !Array.isArray(json.items))
          throw new IntegrationError('Mealie did not return a meal plan.')
        for (const raw of json.items) {
          const entry = toMealEntry(raw)
          if (entry) entries.push(entry)
        }
        const pages = typeof json.total_pages === 'number' ? json.total_pages : 1
        if (page >= pages || entries.length >= MAX_MEAL_ENTRIES) break
      }
      return entries.slice(0, MAX_MEAL_ENTRIES)
    },

    async readRecipe(target, ref): Promise<MealRecipe> {
      const { json } = await call(
        target,
        `/api/recipes/${encodeURIComponent(ref)}`,
        MAX_RECIPE_BYTES,
      )
      if (!isObject(json)) throw new IntegrationError('Mealie does not know that recipe any more.')
      return toRecipe(json, ref)
    },
  }
}

/** `/api/app/about` reports `v2.8.0` for releases and words such as `nightly` for builds. */
function refuseOldVersion(version: Json) {
  const major = typeof version === 'string' ? /^v?(\d+)\./.exec(version.trim())?.[1] : undefined
  if (major !== undefined && Number(major) < 2)
    throw new IntegrationError(
      'This Mealie is older than version 2. Orbit reads the Mealie 2 API, so update Mealie first.',
    )
}

/** One entry of the meal plan. Entries without a usable date or name are dropped. */
export function toMealEntry(raw: Json): MealPlanEntry | undefined {
  if (!isObject(raw)) return undefined
  const date = typeof raw.date === 'string' ? raw.date.slice(0, 10) : ''
  if (!isPlainDate(date)) return undefined
  const recipe = isObject(raw.recipe) ? raw.recipe : undefined
  const slug = recipe ? text(recipe.slug, 200) : undefined
  const recipeName = recipe ? text(recipe.name, 200) : undefined
  const note = text(raw.text, 500)
  const title = text(raw.title, 200) ?? recipeName ?? note?.split('\n')[0]?.slice(0, 200)
  if (title === undefined) return undefined
  const id = text(raw.id, 120)
  return {
    id: id ?? `${date}:${title}`,
    date,
    type: normalizeMealType(raw.entryType),
    title,
    ...(note === undefined || note === title ? {} : { note }),
    ...(slug === undefined ? {} : { recipe: { ref: slug, name: recipeName ?? title } }),
  }
}

/** One item of a shopping list. Mealie formats "2 kg flour" itself in `display`. */
export function toListItem(raw: Json, index: number): ListItem | undefined {
  if (!isObject(raw)) return undefined
  const title = text(raw.display, 200) ?? text(raw.note, 200)
  if (title === undefined) return undefined
  const note = text(raw.note, 500)
  return {
    id: text(raw.id, 120) ?? `${index}:${title}`,
    title,
    completed: raw.checked === true,
    ...(note === undefined || note === title ? {} : { notes: note }),
  }
}

export function toRecipe(raw: Record<string, Json>, ref: string): MealRecipe {
  const ingredients = (Array.isArray(raw.recipeIngredient) ? raw.recipeIngredient : [])
    .slice(0, MAX_RECIPE_LINES)
    .flatMap((i) => {
      const line = isObject(i) ? (text(i.display, 300) ?? text(i.note, 300)) : undefined
      return line === undefined ? [] : [line]
    })
  const instructions = (Array.isArray(raw.recipeInstructions) ? raw.recipeInstructions : [])
    .slice(0, MAX_RECIPE_LINES)
    .flatMap((i) => {
      const line = isObject(i) ? text(i.text, 2000) : undefined
      return line === undefined ? [] : [line]
    })
  const description = text(raw.description, 1000)
  const servings =
    typeof raw.recipeServings === 'number' && raw.recipeServings > 0 && raw.recipeServings < 1000
      ? raw.recipeServings
      : undefined
  return {
    ref,
    name: text(raw.name, 200) ?? ref,
    ...(description === undefined ? {} : { description }),
    ...(servings === undefined ? {} : { servings }),
    ingredients,
    instructions,
  }
}
