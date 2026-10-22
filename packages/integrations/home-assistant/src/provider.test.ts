import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  EgressDeniedError,
  IntegrationError,
  type EgressFetcher,
  type EgressRequest,
} from '@orbit/application'
import { InvariantViolation } from '@orbit/domain'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHomeAssistantProvider } from './provider.ts'

const TOKEN = 'eyJ.fake-long-lived-token.sig'

interface Seen {
  method: string
  path: string
  authorization: string | undefined
  body: string
}

let server: Server
let base: string
let seen: Seen[]
let routes: Map<string, { status: number; body: string }>

/** A plain fetch against the in-process server, standing in for the egress guard. */
const fetcher: EgressFetcher = {
  async fetchText(request: EgressRequest) {
    const response = await fetch(request.url, {
      method: request.method ?? 'GET',
      headers: request.headers as Record<string, string>,
      ...(request.body === undefined ? {} : { body: request.body }),
    })
    return {
      status: response.status,
      body: await response.text(),
      finalUrl: request.url,
    }
  },
}

const provider = () => createHomeAssistantProvider(fetcher)
const target = () => ({ baseUrl: base, token: TOKEN })

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

beforeEach(async () => {
  seen = []
  routes = new Map()
  server = createServer(async (req, res) => {
    const body = await readBody(req)
    const path = req.url ?? ''
    seen.push({ method: req.method ?? '', path, authorization: req.headers.authorization, body })
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

const json = (value: unknown, status = 200) => ({ status, body: JSON.stringify(value) })

describe('parseAddress', () => {
  const parse = (input: string) => provider().parseAddress(input)

  it('keeps the origin and a path prefix, and drops a trailing slash, query and hash', () => {
    expect(parse(' http://homeassistant.local:8123/ ')).toEqual({
      url: 'http://homeassistant.local:8123',
      host: 'homeassistant.local:8123',
    })
    expect(parse('https://home.example.com/ha/?x=1#y').url).toBe('https://home.example.com/ha')
  })

  it('refuses addresses without a scheme, other schemes and credentials', () => {
    expect(() => parse('homeassistant.local:8123')).toThrow(InvariantViolation)
    expect(() => parse('ftp://example.com')).toThrow(InvariantViolation)
    expect(() => parse('http://user:pw@example.com')).toThrow(/user name/)
    expect(() => parse('')).toThrow(InvariantViolation)
  })
})

describe('discover', () => {
  it('lists calendars and to-do lists by name, sending the token as a bearer header', async () => {
    routes.set(
      'GET /api/states',
      json([
        { entity_id: 'light.kitchen', state: 'on', attributes: {} },
        {
          entity_id: 'todo.shopping_list',
          state: '3',
          attributes: { friendly_name: 'Shopping list' },
        },
        { entity_id: 'todo.chores', state: '0', attributes: {} },
      ]),
    )
    routes.set('GET /api/calendars', json([{ name: 'Family', entity_id: 'calendar.family' }]))
    const found = await provider().discover(target())
    expect(found).toEqual([
      { entityId: 'calendar.family', role: 'calendar', name: 'Family' },
      { entityId: 'todo.shopping_list', role: 'todo', name: 'Shopping list' },
      { entityId: 'todo.chores', role: 'todo', name: 'todo.chores' },
    ])
    expect(seen.every((s) => s.authorization === `Bearer ${TOKEN}`)).toBe(true)
  })

  it('treats a missing calendar endpoint as no calendars', async () => {
    routes.set('GET /api/states', json([]))
    await expect(provider().discover(target())).resolves.toEqual([])
  })

  it('reports a refused token without repeating it', async () => {
    routes.set('GET /api/states', { status: 401, body: '401: Unauthorized' })
    const error = await provider()
      .discover(target())
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(IntegrationError)
    expect((error as Error).message).toMatch(/refused the access token/)
    expect((error as Error).message).not.toContain(TOKEN)
    expect((error as Error).message).not.toContain('127.0.0.1')
  })

  it('explains an answer that is not JSON', async () => {
    routes.set('GET /api/states', { status: 200, body: '<html>Home Assistant</html>' })
    await expect(provider().discover(target())).rejects.toThrow(/did not answer with JSON/)
  })

  it('tells the operator how to allow a private address', async () => {
    const blocked: EgressFetcher = {
      fetchText: async () => {
        throw new EgressDeniedError('blocked-address', 'That address is not allowed.')
      },
    }
    await expect(
      createHomeAssistantProvider(blocked).discover({
        baseUrl: 'http://10.0.0.5:8123',
        token: TOKEN,
      }),
    ).rejects.toThrow(/ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS/)
  })

  it('keeps the request on the host the owner typed', async () => {
    let allowed: readonly string[] | undefined
    const spy: EgressFetcher = {
      fetchText: async (request) => {
        allowed = request.allowedHosts
        return { status: 200, body: '[]', finalUrl: request.url }
      },
    }
    await createHomeAssistantProvider(spy).discover({
      baseUrl: 'https://ha.example.com/prefix',
      token: TOKEN,
    })
    expect(allowed).toEqual(['ha.example.com'])
  })
})

describe('readCalendar', () => {
  const range = {
    from: new Date('2026-01-01T00:00:00Z'),
    to: new Date('2026-01-08T00:00:00Z'),
  }

  it('maps timed, all-day and recurring events and sends the range', async () => {
    routes.set(
      'GET /api/calendars/calendar.family',
      json([
        {
          summary: 'Dentist',
          start: { dateTime: '2026-01-02T10:00:00+01:00' },
          end: { dateTime: '2026-01-02T11:00:00+01:00' },
          description: null,
          location: 'Main street 1',
          uid: 'u1',
        },
        {
          summary: 'Holiday',
          start: { date: '2026-01-03' },
          end: { date: '2026-01-05' },
          uid: 'u2',
        },
        {
          summary: 'Bins',
          start: { date: '2026-01-06' },
          end: { date: '2026-01-06' },
          rrule: 'FREQ=WEEKLY',
          recurrence_id: '20260106',
          uid: 'u3',
        },
        { summary: 'Broken', start: { dateTime: 'not a date' }, end: {} },
      ]),
    )
    const events = await provider().readCalendar(target(), 'calendar.family', range)
    expect(events).toEqual([
      {
        kind: 'timed',
        id: 'u1|2026-01-02T09:00:00.000Z',
        title: 'Dentist',
        location: 'Main street 1',
        isOverride: false,
        isRecurring: false,
        start: '2026-01-02T09:00:00.000Z',
        end: '2026-01-02T10:00:00.000Z',
      },
      {
        kind: 'all-day',
        id: 'u2|2026-01-03',
        title: 'Holiday',
        isOverride: false,
        isRecurring: false,
        startDate: '2026-01-03',
        endDate: '2026-01-05',
      },
      {
        kind: 'all-day',
        id: 'u3|20260106',
        title: 'Bins',
        isOverride: false,
        isRecurring: true,
        startDate: '2026-01-06',
        endDate: '2026-01-07',
      },
    ])
    expect(seen[0]!.path).toBe(
      '/api/calendars/calendar.family?start=2026-01-01T00%3A00%3A00.000Z&end=2026-01-08T00%3A00%3A00.000Z',
    )
  })

  it('says so when the calendar is gone', async () => {
    await expect(provider().readCalendar(target(), 'calendar.gone', range)).rejects.toThrow(
      /does not know that calendar/,
    )
  })
})

describe('readTodoList', () => {
  it('maps items through the get_items action', async () => {
    routes.set(
      'POST /api/services/todo/get_items',
      json({
        changed_states: [],
        service_response: {
          'todo.shopping_list': {
            items: [
              { summary: 'Milk', uid: 'a', status: 'needs_action' },
              {
                summary: 'Bread',
                uid: 'b',
                status: 'completed',
                due: '2026-01-04',
                description: 'Rye',
              },
              {
                summary: 'Cake',
                uid: 'c',
                status: 'needs_action',
                due: '2026-01-04T12:00:00+01:00',
              },
            ],
          },
        },
      }),
    )
    const list = await provider().readTodoList(target(), 'todo.shopping_list')
    expect(list.items).toEqual([
      { id: 'a', title: 'Milk', completed: false },
      {
        id: 'b',
        title: 'Bread',
        completed: true,
        due: { kind: 'date', date: '2026-01-04' },
        notes: 'Rye',
      },
      {
        id: 'c',
        title: 'Cake',
        completed: false,
        due: { kind: 'datetime', at: '2026-01-04T11:00:00.000Z' },
      },
    ])
    expect(seen[0]).toMatchObject({
      method: 'POST',
      path: '/api/services/todo/get_items?return_response',
      body: JSON.stringify({ entity_id: 'todo.shopping_list' }),
    })
  })

  it('refuses an answer without the list', async () => {
    routes.set(
      'POST /api/services/todo/get_items',
      json({ changed_states: [], service_response: {} }),
    )
    await expect(provider().readTodoList(target(), 'todo.x')).rejects.toThrow(
      /did not return the items/,
    )
  })

  it('reports a failing action with its status only', async () => {
    routes.set('POST /api/services/todo/get_items', { status: 400, body: 'secret detail' })
    const error = await provider()
      .readTodoList(target(), 'todo.x')
      .catch((e: unknown) => e)
    expect((error as Error).message).toBe('Home Assistant answered with status 400.')
  })
})
