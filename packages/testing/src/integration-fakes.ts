import {
  IntegrationError,
  type ConnectionTarget,
  type DiscoveredEntity,
  type IntegrationProvider,
} from '@orbit/application'
import {
  InvariantViolation,
  type CalendarEvent,
  type ConnectionKind,
  type MealPlanEntry,
  type MealRecipe,
  type StockItem,
  type TodoList,
} from '@orbit/domain'

/**
 * A Home Assistant, Mealie or Grocy for tests. Each base address maps to what it holds. `calls` counts reads, so
 * tests can prove the cache works, and `tokens` records what was sent, so tests can prove a
 * token is used but never returned.
 */
export interface FakeSystem {
  readonly token: string
  readonly entities: DiscoveredEntity[]
  readonly calendars: Map<string, CalendarEvent[] | Error>
  readonly todos: Map<string, TodoList | Error>
  readonly mealPlans: Map<string, MealPlanEntry[] | Error>
  readonly recipes: Map<string, MealRecipe | Error>
  readonly stock: Map<string, StockItem[] | Error>
}

export class FakeIntegrationProvider implements IntegrationProvider {
  readonly kind: ConnectionKind
  readonly systems = new Map<string, FakeSystem>()
  readonly calls: string[] = []

  constructor(kind: ConnectionKind = 'homeassistant') {
    this.kind = kind
  }

  parseAddress(input: string) {
    const url = input.trim().replace(/\/+$/, '')
    const host = /^https?:\/\/([^/\s?#]+)/i.exec(url)?.[1]
    if (host === undefined || host.includes('@'))
      throw new InvariantViolation('That is not a valid address')
    return { url, host }
  }

  /** Registers a system reachable at `url` and returns it for the test to fill. */
  add(url: string, token = 'tok-secret'): FakeSystem {
    const system: FakeSystem = {
      token,
      entities: [],
      calendars: new Map(),
      todos: new Map(),
      mealPlans: new Map(),
      recipes: new Map(),
      stock: new Map(),
    }
    this.systems.set(url, system)
    return system
  }

  #open(target: ConnectionTarget): FakeSystem {
    const system = this.systems.get(target.baseUrl)
    if (!system) throw new IntegrationError('The server could not be reached.')
    if (system.token !== target.token)
      throw new IntegrationError('The other system refused the access token.')
    return system
  }

  async discover(target: ConnectionTarget) {
    this.calls.push('discover')
    return [...this.#open(target).entities]
  }

  async readCalendar(target: ConnectionTarget, entityId: string) {
    this.calls.push(`calendar:${entityId}`)
    const events = this.#open(target).calendars.get(entityId)
    if (events === undefined)
      throw new IntegrationError('Home Assistant does not know that calendar.')
    if (events instanceof Error) throw events
    return events
  }

  async readTodoList(target: ConnectionTarget, entityId: string) {
    this.calls.push(`todo:${entityId}`)
    const list = this.#open(target).todos.get(entityId)
    if (list === undefined) throw new IntegrationError('Home Assistant does not know that list.')
    if (list instanceof Error) throw list
    return list
  }

  async readMealPlan(
    target: ConnectionTarget,
    entityId: string,
    range: { from: string; to: string },
  ) {
    this.calls.push(`meals:${entityId}:${range.from}:${range.to}`)
    const entries = this.#open(target).mealPlans.get(entityId)
    if (entries === undefined) throw new IntegrationError('The other system has no such meal plan.')
    if (entries instanceof Error) throw entries
    return entries.filter((e) => e.date >= range.from && e.date <= range.to)
  }

  async readRecipe(target: ConnectionTarget, ref: string) {
    this.calls.push(`recipe:${ref}`)
    const recipe = this.#open(target).recipes.get(ref)
    if (recipe === undefined) throw new IntegrationError('The other system has no such recipe.')
    if (recipe instanceof Error) throw recipe
    return recipe
  }

  async readStock(target: ConnectionTarget, entityId: string) {
    this.calls.push(`stock:${entityId}`)
    const items = this.#open(target).stock.get(entityId)
    if (items === undefined) throw new IntegrationError('The other system has no such stock view.')
    if (items instanceof Error) throw items
    return items
  }
}
