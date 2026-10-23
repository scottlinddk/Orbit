import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PUBLIC_OPERATIONS } from './public-operations.ts'
import { createTestEnv, createTestPlanets, type TestClient, type TestEnv } from './test-support.ts'

/**
 * The household-isolation kit, re-run through HTTP. Routes can bypass use cases, so the
 * invariant has to hold here too: another household's resources answer 404, byte-for-byte
 * the same as a resource that does not exist, and members are limited to what their role allows.
 *
 * Every protected operation in the OpenAPI document must appear in `cases` or in `NO_FOREIGN_ID`.
 * A new route without an entry fails the "covers every operation" test.
 */

interface Ids {
  household: string
  dashboard: string
  widget: string
  /** A placement of an installed Planet, rendered by the Planet route. */
  planetWidget: string
  invitation: string
  feed: string
  list: string
  item: string
  calendarSource: string
  connection: string
  mealie: string
  notificationEndpoint: string
  alice: string
}

interface Case {
  /** Same key as in the OpenAPI document: "<method> <path>". */
  key: string
  call: (c: TestClient, ids: Ids) => ReturnType<TestClient['get']>
  /** The same call aimed at an id that does not exist. */
  callMissing: (c: TestClient) => ReturnType<TestClient['get']>
  /** Whether a plain member (not owner) is allowed. */
  memberAllowed: boolean
}

const V1 = '/api/v1'
const GONE = 'does-not-exist'
const CALENDAR_URL = 'https://calendar.example.com/private/abc123.ics'
const HA_URL = 'http://ha.local:8123'
const HA_TOKEN = 'ha-token-secret'
const MEALIE_URL = 'http://mealie.local:9000'
const MEALIE_TOKEN = 'mealie-token-secret'
const GROCY_URL = 'http://grocy.local:9283'
const GROCY_KEY = 'grocy-key-secret'
const WEBHOOK_URL = 'https://hooks.example.com/services/T000/B000/secret-token'
const ENDPOINTS = 'notifications/endpoints'

const cases: Case[] = [
  {
    key: 'get /api/v1/households/{householdId}',
    call: (c, i) => c.get(`${V1}/households/${i.household}`),
    callMissing: (c) => c.get(`${V1}/households/${GONE}`),
    memberAllowed: true,
  },
  {
    key: 'post /api/v1/households/{householdId}/members',
    call: (c, i) => c.post(`${V1}/households/${i.household}/members`, { username: 'carol' }),
    callMissing: (c) => c.post(`${V1}/households/${GONE}/members`, { username: 'carol' }),
    memberAllowed: false,
  },
  {
    key: 'patch /api/v1/households/{householdId}/members/{userId}',
    call: (c, i) =>
      c.patch(`${V1}/households/${i.household}/members/${i.alice}`, { role: 'member' }),
    callMissing: (c) => c.patch(`${V1}/households/${GONE}/members/${GONE}`, { role: 'member' }),
    memberAllowed: false,
  },
  {
    key: 'delete /api/v1/households/{householdId}/members/{userId}',
    call: (c, i) => c.delete(`${V1}/households/${i.household}/members/${i.alice}`),
    callMissing: (c) => c.delete(`${V1}/households/${GONE}/members/${GONE}`),
    memberAllowed: false,
  },
  {
    key: 'post /api/v1/households/{householdId}/invitations',
    call: (c, i) => c.post(`${V1}/households/${i.household}/invitations`, { role: 'member' }),
    callMissing: (c) => c.post(`${V1}/households/${GONE}/invitations`, { role: 'member' }),
    memberAllowed: false,
  },
  {
    key: 'get /api/v1/households/{householdId}/invitations',
    call: (c, i) => c.get(`${V1}/households/${i.household}/invitations`),
    callMissing: (c) => c.get(`${V1}/households/${GONE}/invitations`),
    memberAllowed: false,
  },
  {
    key: 'delete /api/v1/households/{householdId}/invitations/{invitationId}',
    call: (c, i) => c.delete(`${V1}/households/${i.household}/invitations/${i.invitation}`),
    callMissing: (c) => c.delete(`${V1}/households/${GONE}/invitations/${GONE}`),
    memberAllowed: false,
  },
  {
    key: 'post /api/v1/households/{householdId}/feeds',
    call: (c, i) =>
      c.post(`${V1}/households/${i.household}/feeds`, { name: 'Spy', fields: ['household.name'] }),
    callMissing: (c) =>
      c.post(`${V1}/households/${GONE}/feeds`, { name: 'Spy', fields: ['household.name'] }),
    memberAllowed: false,
  },
  {
    key: 'get /api/v1/households/{householdId}/feeds',
    call: (c, i) => c.get(`${V1}/households/${i.household}/feeds`),
    callMissing: (c) => c.get(`${V1}/households/${GONE}/feeds`),
    memberAllowed: false,
  },
  {
    key: 'delete /api/v1/households/{householdId}/feeds/{feedId}',
    call: (c, i) => c.delete(`${V1}/households/${i.household}/feeds/${i.feed}`),
    callMissing: (c) => c.delete(`${V1}/households/${GONE}/feeds/${GONE}`),
    memberAllowed: false,
  },
  {
    key: 'get /api/v1/households/{householdId}/lists',
    call: (c, i) => c.get(`${V1}/households/${i.household}/lists`),
    callMissing: (c) => c.get(`${V1}/households/${GONE}/lists`),
    memberAllowed: true,
  },
  {
    key: 'post /api/v1/households/{householdId}/lists',
    call: (c, i) =>
      c.post(`${V1}/households/${i.household}/lists`, { name: 'Intruder', kind: 'todo' }),
    callMissing: (c) =>
      c.post(`${V1}/households/${GONE}/lists`, { name: 'Intruder', kind: 'todo' }),
    memberAllowed: true,
  },
  {
    key: 'get /api/v1/households/{householdId}/lists/{listId}',
    call: (c, i) => c.get(`${V1}/households/${i.household}/lists/${i.list}`),
    callMissing: (c) => c.get(`${V1}/households/${GONE}/lists/${GONE}`),
    memberAllowed: true,
  },
  {
    key: 'delete /api/v1/households/{householdId}/lists/{listId}',
    call: (c, i) => c.delete(`${V1}/households/${i.household}/lists/${i.list}`),
    callMissing: (c) => c.delete(`${V1}/households/${GONE}/lists/${GONE}`),
    memberAllowed: true,
  },
  {
    key: 'put /api/v1/households/{householdId}/lists/{listId}/name',
    call: (c, i) => c.put(`${V1}/households/${i.household}/lists/${i.list}/name`, { name: 'X' }),
    callMissing: (c) => c.put(`${V1}/households/${GONE}/lists/${GONE}/name`, { name: 'X' }),
    memberAllowed: true,
  },
  {
    key: 'post /api/v1/households/{householdId}/lists/{listId}/items',
    call: (c, i) =>
      c.post(`${V1}/households/${i.household}/lists/${i.list}/items`, { text: 'Intruder' }),
    callMissing: (c) =>
      c.post(`${V1}/households/${GONE}/lists/${GONE}/items`, { text: 'Intruder' }),
    memberAllowed: true,
  },
  {
    key: 'patch /api/v1/households/{householdId}/lists/{listId}/items/{itemId}',
    call: (c, i) =>
      c.patch(`${V1}/households/${i.household}/lists/${i.list}/items/${i.item}`, { done: true }),
    callMissing: (c) =>
      c.patch(`${V1}/households/${GONE}/lists/${GONE}/items/${GONE}`, { done: true }),
    memberAllowed: true,
  },
  {
    key: 'delete /api/v1/households/{householdId}/lists/{listId}/items/{itemId}',
    call: (c, i) => c.delete(`${V1}/households/${i.household}/lists/${i.list}/items/${i.item}`),
    callMissing: (c) => c.delete(`${V1}/households/${GONE}/lists/${GONE}/items/${GONE}`),
    memberAllowed: true,
  },
  {
    key: 'put /api/v1/households/{householdId}/lists/{listId}/items/{itemId}/position',
    call: (c, i) =>
      c.put(`${V1}/households/${i.household}/lists/${i.list}/items/${i.item}/position`, {
        index: 0,
      }),
    callMissing: (c) =>
      c.put(`${V1}/households/${GONE}/lists/${GONE}/items/${GONE}/position`, { index: 0 }),
    memberAllowed: true,
  },
  {
    key: 'post /api/v1/households/{householdId}/lists/{listId}/clear-completed',
    call: (c, i) => c.post(`${V1}/households/${i.household}/lists/${i.list}/clear-completed`),
    callMissing: (c) => c.post(`${V1}/households/${GONE}/lists/${GONE}/clear-completed`),
    memberAllowed: true,
  },
  {
    key: 'post /api/v1/households/{householdId}/calendar/sources',
    call: (c, i) =>
      c.post(`${V1}/households/${i.household}/calendar/sources`, {
        name: 'Spy',
        url: CALENDAR_URL,
      }),
    callMissing: (c) =>
      c.post(`${V1}/households/${GONE}/calendar/sources`, { name: 'Spy', url: CALENDAR_URL }),
    memberAllowed: false,
  },
  {
    key: 'get /api/v1/households/{householdId}/calendar/sources',
    call: (c, i) => c.get(`${V1}/households/${i.household}/calendar/sources`),
    callMissing: (c) => c.get(`${V1}/households/${GONE}/calendar/sources`),
    memberAllowed: true,
  },
  {
    key: 'delete /api/v1/households/{householdId}/calendar/sources/{sourceId}',
    call: (c, i) =>
      c.delete(`${V1}/households/${i.household}/calendar/sources/${i.calendarSource}`),
    callMissing: (c) => c.delete(`${V1}/households/${GONE}/calendar/sources/${GONE}`),
    memberAllowed: false,
  },
  {
    key: 'post /api/v1/households/{householdId}/connections',
    call: (c, i) =>
      c.post(`${V1}/households/${i.household}/connections`, {
        kind: 'homeassistant',
        name: 'Spy',
        url: HA_URL,
        token: HA_TOKEN,
      }),
    callMissing: (c) =>
      c.post(`${V1}/households/${GONE}/connections`, {
        kind: 'homeassistant',
        name: 'Spy',
        url: HA_URL,
        token: HA_TOKEN,
      }),
    memberAllowed: false,
  },
  {
    key: 'get /api/v1/households/{householdId}/connections',
    call: (c, i) => c.get(`${V1}/households/${i.household}/connections`),
    callMissing: (c) => c.get(`${V1}/households/${GONE}/connections`),
    memberAllowed: false,
  },
  {
    key: 'delete /api/v1/households/{householdId}/connections/{connectionId}',
    call: (c, i) => c.delete(`${V1}/households/${i.household}/connections/${i.connection}`),
    callMissing: (c) => c.delete(`${V1}/households/${GONE}/connections/${GONE}`),
    memberAllowed: false,
  },
  {
    key: 'post /api/v1/households/{householdId}/connections/{connectionId}/test',
    call: (c, i) => c.post(`${V1}/households/${i.household}/connections/${i.connection}/test`),
    callMissing: (c) => c.post(`${V1}/households/${GONE}/connections/${GONE}/test`),
    memberAllowed: false,
  },
  {
    key: 'get /api/v1/households/{householdId}/connections/{connectionId}/entities',
    call: (c, i) => c.get(`${V1}/households/${i.household}/connections/${i.connection}/entities`),
    callMissing: (c) => c.get(`${V1}/households/${GONE}/connections/${GONE}/entities`),
    memberAllowed: false,
  },
  {
    key: 'put /api/v1/households/{householdId}/connections/{connectionId}/mirrors',
    call: (c, i) =>
      c.put(`${V1}/households/${i.household}/connections/${i.connection}/mirrors`, {
        entityIds: [],
      }),
    callMissing: (c) =>
      c.put(`${V1}/households/${GONE}/connections/${GONE}/mirrors`, { entityIds: [] }),
    memberAllowed: false,
  },
  {
    key: 'get /api/v1/households/{householdId}/calendar/events',
    call: (c, i) => c.get(`${V1}/households/${i.household}/calendar/events`),
    callMissing: (c) => c.get(`${V1}/households/${GONE}/calendar/events`),
    memberAllowed: true,
  },
  {
    key: 'get /api/v1/households/{householdId}/meals',
    call: (c, i) => c.get(`${V1}/households/${i.household}/meals`),
    callMissing: (c) => c.get(`${V1}/households/${GONE}/meals`),
    memberAllowed: true,
  },
  {
    key: 'get /api/v1/households/{householdId}/meals/recipes/{connectionId}/{ref}',
    call: (c, i) => c.get(`${V1}/households/${i.household}/meals/recipes/${i.mealie}/chili`),
    callMissing: (c) => c.get(`${V1}/households/${GONE}/meals/recipes/${GONE}/chili`),
    memberAllowed: true,
  },
  {
    key: 'get /api/v1/households/{householdId}/stock',
    call: (c, i) => c.get(`${V1}/households/${i.household}/stock`),
    callMissing: (c) => c.get(`${V1}/households/${GONE}/stock`),
    memberAllowed: true,
  },
  {
    key: 'post /api/v1/households/{householdId}/notifications/endpoints',
    call: (c, i) =>
      c.post(`${V1}/households/${i.household}/${ENDPOINTS}`, {
        name: 'Spy',
        url: WEBHOOK_URL,
        events: ['list.item.added'],
      }),
    callMissing: (c) =>
      c.post(`${V1}/households/${GONE}/${ENDPOINTS}`, {
        name: 'Spy',
        url: WEBHOOK_URL,
        events: ['list.item.added'],
      }),
    memberAllowed: false,
  },
  {
    key: 'get /api/v1/households/{householdId}/notifications/endpoints',
    call: (c, i) => c.get(`${V1}/households/${i.household}/${ENDPOINTS}`),
    callMissing: (c) => c.get(`${V1}/households/${GONE}/${ENDPOINTS}`),
    memberAllowed: false,
  },
  {
    key: 'patch /api/v1/households/{householdId}/notifications/endpoints/{endpointId}',
    call: (c, i) =>
      c.patch(`${V1}/households/${i.household}/${ENDPOINTS}/${i.notificationEndpoint}`, {
        enabled: false,
      }),
    callMissing: (c) =>
      c.patch(`${V1}/households/${GONE}/${ENDPOINTS}/${GONE}`, { enabled: false }),
    memberAllowed: false,
  },
  {
    key: 'delete /api/v1/households/{householdId}/notifications/endpoints/{endpointId}',
    call: (c, i) =>
      c.delete(`${V1}/households/${i.household}/${ENDPOINTS}/${i.notificationEndpoint}`),
    callMissing: (c) => c.delete(`${V1}/households/${GONE}/${ENDPOINTS}/${GONE}`),
    memberAllowed: false,
  },
  {
    key: 'get /api/v1/households/{householdId}/notifications/endpoints/{endpointId}/deliveries',
    call: (c, i) =>
      c.get(`${V1}/households/${i.household}/${ENDPOINTS}/${i.notificationEndpoint}/deliveries`),
    callMissing: (c) => c.get(`${V1}/households/${GONE}/${ENDPOINTS}/${GONE}/deliveries`),
    memberAllowed: false,
  },
  {
    key: 'post /api/v1/households/{householdId}/notifications/endpoints/{endpointId}/test',
    call: (c, i) =>
      c.post(`${V1}/households/${i.household}/${ENDPOINTS}/${i.notificationEndpoint}/test`),
    callMissing: (c) => c.post(`${V1}/households/${GONE}/${ENDPOINTS}/${GONE}/test`),
    memberAllowed: false,
  },
  {
    key: 'get /api/v1/households/{householdId}/dashboards',
    call: (c, i) => c.get(`${V1}/households/${i.household}/dashboards`),
    callMissing: (c) => c.get(`${V1}/households/${GONE}/dashboards`),
    memberAllowed: true,
  },
  {
    key: 'post /api/v1/households/{householdId}/dashboards',
    call: (c, i) => c.post(`${V1}/households/${i.household}/dashboards`, { name: 'Intruder' }),
    callMissing: (c) => c.post(`${V1}/households/${GONE}/dashboards`, { name: 'Intruder' }),
    memberAllowed: false,
  },
  {
    key: 'get /api/v1/dashboards/{dashboardId}',
    call: (c, i) => c.get(`${V1}/dashboards/${i.dashboard}`),
    callMissing: (c) => c.get(`${V1}/dashboards/${GONE}`),
    memberAllowed: true,
  },
  {
    key: 'delete /api/v1/dashboards/{dashboardId}',
    call: (c, i) => c.delete(`${V1}/dashboards/${i.dashboard}`),
    callMissing: (c) => c.delete(`${V1}/dashboards/${GONE}`),
    memberAllowed: false,
  },
  {
    key: 'put /api/v1/dashboards/{dashboardId}/name',
    call: (c, i) => c.put(`${V1}/dashboards/${i.dashboard}/name`, { name: 'Hacked' }),
    callMissing: (c) => c.put(`${V1}/dashboards/${GONE}/name`, { name: 'Hacked' }),
    memberAllowed: false,
  },
  {
    key: 'put /api/v1/dashboards/{dashboardId}/columns',
    call: (c, i) => c.put(`${V1}/dashboards/${i.dashboard}/columns`, { columns: 1 }),
    callMissing: (c) => c.put(`${V1}/dashboards/${GONE}/columns`, { columns: 1 }),
    memberAllowed: false,
  },
  {
    key: 'post /api/v1/dashboards/{dashboardId}/widgets',
    call: (c, i) => c.post(`${V1}/dashboards/${i.dashboard}/widgets`, { type: 'lists.shopping' }),
    callMissing: (c) => c.post(`${V1}/dashboards/${GONE}/widgets`, { type: 'lists.shopping' }),
    memberAllowed: false,
  },
  {
    key: 'delete /api/v1/dashboards/{dashboardId}/widgets/{widgetId}',
    call: (c, i) => c.delete(`${V1}/dashboards/${i.dashboard}/widgets/${i.widget}`),
    callMissing: (c) => c.delete(`${V1}/dashboards/${GONE}/widgets/${GONE}`),
    memberAllowed: false,
  },
  {
    key: 'get /api/v1/dashboards/{dashboardId}/widgets/{widgetId}/planet',
    call: (c, i) => c.get(`${V1}/dashboards/${i.dashboard}/widgets/${i.planetWidget}/planet`),
    callMissing: (c) => c.get(`${V1}/dashboards/${GONE}/widgets/${GONE}/planet`),
    memberAllowed: true,
  },
  {
    key: 'put /api/v1/dashboards/{dashboardId}/widgets/{widgetId}/position',
    call: (c, i) =>
      c.put(`${V1}/dashboards/${i.dashboard}/widgets/${i.widget}/position`, { toIndex: 0 }),
    callMissing: (c) => c.put(`${V1}/dashboards/${GONE}/widgets/${GONE}/position`, { toIndex: 0 }),
    memberAllowed: false,
  },
  {
    key: 'put /api/v1/dashboards/{dashboardId}/widgets/{widgetId}/span',
    call: (c, i) => c.put(`${V1}/dashboards/${i.dashboard}/widgets/${i.widget}/span`, { span: 2 }),
    callMissing: (c) => c.put(`${V1}/dashboards/${GONE}/widgets/${GONE}/span`, { span: 2 }),
    memberAllowed: false,
  },
  {
    key: 'put /api/v1/dashboards/{dashboardId}/widgets/{widgetId}/config',
    call: (c, i) =>
      c.put(`${V1}/dashboards/${i.dashboard}/widgets/${i.widget}/config`, { config: { a: 1 } }),
    callMissing: (c) => c.put(`${V1}/dashboards/${GONE}/widgets/${GONE}/config`, { config: {} }),
    memberAllowed: false,
  },
]

/** Protected operations that take no id belonging to anyone else. They are covered by 401 tests. */
const NO_FOREIGN_ID = new Set([
  'post /api/v1/auth/logout',
  'get /api/v1/auth/me',
  'get /api/v1/households',
  'post /api/v1/households',
  'get /api/v1/planets/widgets',
])

describe.each(['memory', 'sqlite'] as const)('household isolation over HTTP (%s)', (storage) => {
  let env: TestEnv
  let alice: TestClient, bob: TestClient, carol: TestClient, anon: TestClient
  let dave: TestClient, eve: TestClient
  let ids: Ids

  beforeEach(async () => {
    env = await createTestEnv({ storage, planets: createTestPlanets() })
    alice = env.client()
    bob = env.client()
    carol = env.client()
    dave = env.client()
    eve = env.client()
    anon = env.client()
    const aliceUser = await alice.signUp('alice')
    await bob.signUp('bobby')
    await carol.signUp('carol')
    await dave.signUp('dave')
    await eve.signUp('eve')

    const household = (await alice.post(`${V1}/households`, { name: 'A' })).body.id
    await alice.post(`${V1}/households/${household}/members`, { username: 'bobby' })
    await alice.post(`${V1}/households/${household}/members`, { username: 'dave', role: 'child' })
    await alice.post(`${V1}/households/${household}/members`, { username: 'eve', role: 'device' })
    await carol.post(`${V1}/households`, { name: 'B' })
    const dashboard = (
      await alice.post(`${V1}/households/${household}/dashboards`, { name: 'Family' })
    ).body
    const withWidget = (
      await alice.post(`${V1}/dashboards/${dashboard.id}/widgets`, { type: 'calendar.agenda' })
    ).body
    const withPlanet = (
      await alice.post(`${V1}/dashboards/${dashboard.id}/widgets`, {
        type: 'planet.dev.test.static',
      })
    ).body
    const invitation = (await alice.post(`${V1}/households/${household}/invitations`)).body
    env.ics.feeds.set(
      CALENDAR_URL,
      'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//t//EN\r\nEND:VCALENDAR',
    )
    const calendarSource = (
      await alice.post(`${V1}/households/${household}/calendar/sources`, {
        name: 'Family',
        url: CALENDAR_URL,
      })
    ).body
    const system = env.integrations.add(HA_URL, HA_TOKEN)
    system.entities.push(
      { entityId: 'calendar.family', role: 'calendar', name: 'Family' },
      { entityId: 'todo.shopping', role: 'todo', name: 'Shopping' },
    )
    system.todos.set('todo.shopping', { id: 'todo.shopping', name: 'Shopping', items: [] })
    system.calendars.set('calendar.family', [])
    const connection = (
      await alice.post(`${V1}/households/${household}/connections`, {
        kind: 'homeassistant',
        name: 'Home Assistant',
        url: HA_URL,
        token: HA_TOKEN,
      })
    ).body
    await alice.put(`${V1}/households/${household}/connections/${connection.id}/mirrors`, {
      entityIds: ['calendar.family', 'todo.shopping'],
    })
    const mealieSystem = env.mealie.add(MEALIE_URL, MEALIE_TOKEN)
    mealieSystem.entities.push({ entityId: 'mealplan.mealplan', role: 'meals', name: 'Meal plan' })
    mealieSystem.mealPlans.set('mealplan.mealplan', [
      {
        id: 'm1',
        date: '2026-01-01',
        type: 'dinner',
        title: 'Chili',
        recipe: { ref: 'chili', name: 'Chili' },
      },
    ])
    mealieSystem.recipes.set('chili', {
      ref: 'chili',
      name: 'Chili',
      ingredients: ['beans'],
      instructions: ['Simmer.'],
    })
    const mealie = (
      await alice.post(`${V1}/households/${household}/connections`, {
        kind: 'mealie',
        name: 'Mealie',
        url: MEALIE_URL,
        token: MEALIE_TOKEN,
      })
    ).body
    await alice.put(`${V1}/households/${household}/connections/${mealie.id}/mirrors`, {
      entityIds: ['mealplan.mealplan'],
    })
    const grocySystem = env.grocy.add(GROCY_URL, GROCY_KEY)
    grocySystem.entities.push({ entityId: 'stock.stock', role: 'stock', name: 'Stock overview' })
    grocySystem.stock.set('stock.stock', [
      { id: '1', name: 'Milk', status: 'due-soon', amount: 1, bestBefore: '2026-01-03' },
    ])
    const grocy = (
      await alice.post(`${V1}/households/${household}/connections`, {
        kind: 'grocy',
        name: 'Grocy',
        url: GROCY_URL,
        token: GROCY_KEY,
      })
    ).body
    await alice.put(`${V1}/households/${household}/connections/${grocy.id}/mirrors`, {
      entityIds: ['stock.stock'],
    })
    const notificationEndpoint = (
      await alice.post(`${V1}/households/${household}/${ENDPOINTS}`, {
        name: 'Chat',
        url: WEBHOOK_URL,
        events: ['list.item.added'],
      })
    ).body
    const feed = (
      await alice.post(`${V1}/households/${household}/feeds`, {
        name: 'Kitchen',
        fields: ['household.name'],
      })
    ).body
    const list = (
      await alice.post(`${V1}/households/${household}/lists`, {
        name: 'Groceries',
        kind: 'shopping',
      })
    ).body
    const withItem = (
      await alice.post(`${V1}/households/${household}/lists/${list.id}/items`, { text: 'Milk' })
    ).body
    ids = {
      list: list.id,
      item: withItem.items[0].id,
      household,
      invitation: invitation.id,
      feed: feed.id,
      calendarSource: calendarSource.id,
      connection: connection.id,
      mealie: mealie.id,
      notificationEndpoint: notificationEndpoint.id,
      dashboard: dashboard.id,
      widget: withWidget.widgets[0].id,
      planetWidget: withPlanet.widgets.at(-1).id,
      alice: aliceUser.id,
    }
  })
  afterEach(() => env.close())

  const state = async () => ({
    household: (await alice.get(`${V1}/households/${ids.household}`)).body,
    dashboards: (await alice.get(`${V1}/households/${ids.household}/dashboards`)).body,
    invitations: (await alice.get(`${V1}/households/${ids.household}/invitations`)).body,
    feeds: (await alice.get(`${V1}/households/${ids.household}/feeds`)).body,
    list: (await alice.get(`${V1}/households/${ids.household}/lists/${ids.list}`)).body,
    calendarSources: (await alice.get(`${V1}/households/${ids.household}/calendar/sources`)).body,
    connections: (await alice.get(`${V1}/households/${ids.household}/connections`)).body,
    notificationEndpoints: (await alice.get(`${V1}/households/${ids.household}/${ENDPOINTS}`)).body,
  })

  it('covers every protected operation in the OpenAPI document', async () => {
    const spec = (await anon.get(`${V1}/openapi.json`)).body
    const documented = Object.entries<any>(spec.paths).flatMap(([path, item]) =>
      Object.keys(item).map((method) => `${method} ${path}`),
    )
    const covered = new Set([...cases.map((c) => c.key), ...NO_FOREIGN_ID, ...PUBLIC_OPERATIONS])
    const missing = documented.filter((key) => !covered.has(key))
    expect(missing, 'add these to the isolation cases').toEqual([])
    for (const c of cases) expect(documented, c.key).toContain(c.key)
  })

  describe.each(cases)('$key', (c) => {
    it('is rejected without a session', async () => {
      const res = await c.call(anon, ids)
      expect(res.status).toBe(401)
    })

    it('answers an outsider exactly like a missing resource, and changes nothing', async () => {
      const before = await state()
      const outsider = await c.call(carol, ids)
      const missing = await c.callMissing(carol)
      expect(outsider.status).toBe(404)
      expect(outsider.body).toEqual(missing.body)
      expect(await state()).toEqual(before)
    })

    it(
      c.memberAllowed ? 'allows a plain member' : 'forbids a plain member and changes nothing',
      async () => {
        const before = await state()
        const res = await c.call(bob, ids)
        if (c.memberAllowed) {
          expect([200, 201, 204]).toContain(res.status)
        } else {
          expect(res.status).toBe(403)
          expect(await state()).toEqual(before)
        }
      },
    )
  })

  describe.each(['child', 'device'] as const)('a %s account', (role) => {
    const who = () => (role === 'child' ? dave : eve)

    it.each(cases)('$key: only what the role allows, enforced by the API', async (c) => {
      const before = await state()
      const res = await c.call(who(), ids)
      // A device only shows things: it may read lists but not change them.
      const deviceWritingList =
        role === 'device' && c.key.includes('/lists') && !c.key.startsWith('get ')
      if (c.memberAllowed && !deviceWritingList) {
        expect([200, 201, 204]).toContain(res.status)
      } else {
        expect(res.status).toBe(403)
        expect(await state()).toEqual(before)
      }
    })

    it('never learns who else is in the household', async () => {
      const one = (await who().get(`${V1}/households/${ids.household}`)).body
      expect(one.members).toHaveLength(1)
      const listed = (await who().get(`${V1}/households`)).body.households
      expect(listed[0].members).toHaveLength(1)
    })
  })

  it('lets owners change a role, with the API enforcing the new limits at once', async () => {
    const bobId = (await bob.get(`${V1}/auth/me`)).body.id
    const changed = await alice.patch(`${V1}/households/${ids.household}/members/${bobId}`, {
      role: 'device',
    })
    expect(changed.status).toBe(200)
    expect(changed.body.members.find((m: { userId: string }) => m.userId === bobId).role).toBe(
      'device',
    )
    expect((await bob.get(`${V1}/households/${ids.household}/invitations`)).status).toBe(403)
    expect((await bob.get(`${V1}/dashboards/${ids.dashboard}`)).status).toBe(200)
  })

  it('refuses to demote the last owner and unknown roles', async () => {
    const url = `${V1}/households/${ids.household}/members/${ids.alice}`
    expect((await alice.patch(url, { role: 'member' })).status).toBe(422)
    expect((await alice.patch(url, { role: 'admin' })).status).toBe(400)
  })

  it('stops serving a removed member immediately', async () => {
    const bobId = (await bob.get(`${V1}/auth/me`)).body.id
    expect((await bob.get(`${V1}/dashboards/${ids.dashboard}`)).status).toBe(200)
    await alice.delete(`${V1}/households/${ids.household}/members/${bobId}`)
    expect((await bob.get(`${V1}/dashboards/${ids.dashboard}`)).status).toBe(404)
  })

  it('never lists another household in your own listings', async () => {
    const mine = (await carol.get(`${V1}/households`)).body.households
    expect(mine.map((h: { id: string }) => h.id)).not.toContain(ids.household)
  })

  it('does not reveal whether a username exists to a non-owner trying to add it', async () => {
    const known = await bob.post(`${V1}/households/${ids.household}/members`, { username: 'carol' })
    const unknown = await bob.post(`${V1}/households/${ids.household}/members`, {
      username: 'zzzzz',
    })
    expect(known.status).toBe(403)
    expect(unknown.body).toEqual(known.body)
  })
})
