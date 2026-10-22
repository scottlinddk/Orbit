import {
  FakeNotificationPlatform,
  type TestSystem,
  blocked,
  createInMemoryRepositories,
  createSqliteRepositories,
  createSystem,
  timeout,
} from './index.ts'
import { InMemorySecretStore } from '@orbit/adapter-in-memory'
import {
  ForbiddenError,
  NOTIFICATION_JOB_PREFIX,
  createNotificationService,
  type Actor,
} from '@orbit/application'
import {
  AUTO_DISABLE_AFTER_FAILURES,
  MAX_DELIVERY_ATTEMPTS,
  MAX_NOTIFICATION_ENDPOINTS_PER_HOUSEHOLD,
  InvariantViolation,
  type CalendarEvent,
  type HouseholdId,
  type NotificationEndpoint,
} from '@orbit/domain'
import { beforeEach, describe, expect, it } from 'vitest'

const HOOK = 'https://hooks.example.com/services/T000/B000/secret-token'
const T0 = Date.parse('2026-01-01T00:00:00.000Z')
const MIN = 60 * 1000

describe.each([
  ['in-memory', createInMemoryRepositories],
  ['sqlite', createSqliteRepositories],
])('notification webhooks: %s', (_name, makeRepos) => {
  let sys: TestSystem
  let alice: Actor
  let bob: Actor
  let household: HouseholdId

  const setup = async (options: { notificationRateLimit?: number } = {}) => {
    sys = createSystem(makeRepos(), options)
    alice = await sys.newActor('alice')
    bob = await sys.newActor('bob')
    household = (await sys.useCases.createHousehold(alice, { name: 'Home' })).id
    await sys.useCases.addHouseholdMember(alice, household, { userId: bob.userId })
  }
  beforeEach(() => setup())

  const add = async (
    events: string[] = ['list.item.added'],
    extra: { url?: string; leadMinutes?: number } = {},
  ) =>
    sys.notifications.addEndpoint(alice, household, {
      name: 'Chat',
      url: extra.url ?? HOOK,
      events,
      leadMinutes: extra.leadMinutes,
    })

  const newList = async () =>
    (await sys.useCases.createList(alice, household, { name: 'Groceries', kind: 'shopping' })).list
      .id

  const log = async (endpoint: NotificationEndpoint) =>
    sys.notifications.deliveries(alice, household, endpoint.id)

  const advance = (ms: number) => sys.clock.advance(ms)

  describe('registering an endpoint', () => {
    it('returns the signing secret once and never lists the address or the secret', async () => {
      const { endpoint, signingSecret } = await add()
      expect(signingSecret).toBeTruthy()
      const listed = await sys.notifications.listEndpoints(alice, household)
      expect(listed).toEqual([endpoint])
      const json = JSON.stringify(listed)
      expect(json).not.toContain(signingSecret)
      expect(json).not.toContain('secret-token')
      expect(json).not.toContain('/services/')
      expect(endpoint.host).toBe('hooks.example.com')
    })

    it('is for owners only', async () => {
      await expect(
        sys.notifications.addEndpoint(bob, household, {
          name: 'x',
          url: HOOK,
          events: ['list.item.added'],
        }),
      ).rejects.toBeInstanceOf(ForbiddenError)
      await expect(sys.notifications.listEndpoints(bob, household)).rejects.toBeInstanceOf(
        ForbiddenError,
      )
    })

    it('refuses an address the platform cannot parse', async () => {
      await expect(add(['list.item.added'], { url: 'not a url' })).rejects.toBeInstanceOf(
        InvariantViolation,
      )
    })

    it('limits the number of endpoints per household', async () => {
      for (let i = 0; i < MAX_NOTIFICATION_ENDPOINTS_PER_HOUSEHOLD; i++) await add()
      await expect(add()).rejects.toBeInstanceOf(InvariantViolation)
    })
  })

  describe('delivery', () => {
    it('sends a signed, versioned envelope when a list item is added', async () => {
      const { endpoint, signingSecret } = await add()
      const listId = await newList()
      await sys.useCases.addListItem(bob, household, listId, { text: 'Milk', quantity: '2 l' })
      expect(sys.webhooks.calls).toEqual([])
      expect(await sys.notifications.tick()).toBe(1)

      const [call] = sys.webhooks.calls
      expect(call).toMatchObject({ url: HOOK, method: 'POST' })
      const body = JSON.parse(call!.body!)
      expect(body).toMatchObject({
        version: 1,
        event: 'list.item.added',
        occurredAt: new Date(T0).toISOString(),
        data: { listName: 'Groceries', text: 'Milk', quantity: '2 l' },
      })
      expect(call!.headers).toMatchObject({
        'content-type': 'application/json',
        'x-orbit-event': 'list.item.added',
        'x-orbit-delivery': body.id,
        'x-orbit-timestamp': String(T0 / 1000),
        'x-orbit-signature': `sha256=${signingSecret}:${T0 / 1000}:${call!.body!.length}`,
      })
      expect(await log(endpoint)).toMatchObject([
        { event: 'list.item.added', outcome: 'delivered', httpStatus: 200, attempt: 1 },
      ])
    })

    it('announces completion only when an item is ticked off, not when it is un-ticked', async () => {
      await add(['list.item.completed'])
      const listId = await newList()
      const { items } = await sys.useCases.addListItem(alice, household, listId, { text: 'Eggs' })
      const itemId = items[0]!.id
      await sys.useCases.updateListItem(alice, household, listId, itemId, { text: 'Eggs x12' })
      await sys.useCases.updateListItem(alice, household, listId, itemId, { done: true })
      await sys.useCases.updateListItem(alice, household, listId, itemId, { done: false })
      await sys.notifications.tick()
      expect(sys.webhooks.calls).toHaveLength(1)
      expect(JSON.parse(sys.webhooks.calls[0]!.body!)).toMatchObject({
        event: 'list.item.completed',
        data: { text: 'Eggs x12' },
      })
    })

    it('sends only the events an endpoint chose', async () => {
      await add(['list.item.completed'])
      const listId = await newList()
      await sys.useCases.addListItem(alice, household, listId, { text: 'Eggs' })
      await sys.notifications.tick()
      expect(sys.webhooks.calls).toEqual([])
    })

    it('does not make the list edit fail or wait when a webhook is broken', async () => {
      await add()
      sys.webhooks.reply(HOOK, timeout())
      const listId = await newList()
      await expect(
        sys.useCases.addListItem(alice, household, listId, { text: 'Eggs' }),
      ).resolves.toBeDefined()
    })

    it('keeps notification jobs apart from other jobs sharing the queue', async () => {
      await add()
      await sys.jobs.schedule({ id: 'planet:x:1', runAt: new Date(T0), payload: '{}' })
      const listId = await newList()
      await sys.useCases.addListItem(alice, household, listId, { text: 'Eggs' })
      await sys.notifications.tick()
      expect(await sys.jobs.has('planet:x:1')).toBe(true)
      expect(sys.webhooks.calls).toHaveLength(1)
    })
  })

  describe('retries', () => {
    it('retries a server error with growing pauses until it arrives', async () => {
      const { endpoint } = await add()
      sys.webhooks.reply(HOOK, 500, 503, 200)
      const listId = await newList()
      await sys.useCases.addListItem(alice, household, listId, { text: 'Eggs' })

      await sys.notifications.tick()
      expect(sys.webhooks.calls).toHaveLength(1)
      advance(29 * 1000)
      await sys.notifications.tick()
      expect(sys.webhooks.calls).toHaveLength(1) // still waiting 30 s
      advance(1000)
      await sys.notifications.tick()
      expect(sys.webhooks.calls).toHaveLength(2)
      advance(119 * 1000)
      await sys.notifications.tick()
      expect(sys.webhooks.calls).toHaveLength(2) // waiting 2 min
      advance(1000)
      await sys.notifications.tick()
      expect(sys.webhooks.calls).toHaveLength(3)

      const entries = (await log(endpoint)).reverse()
      expect(entries.map((e) => [e.attempt, e.outcome, e.httpStatus])).toEqual([
        [1, 'retrying', 500],
        [2, 'retrying', 503],
        [3, 'delivered', 200],
      ])
      // One delivery, three tries: the id stays the same so a receiver can ignore repeats.
      expect(new Set(sys.webhooks.calls.map((c) => c.headers?.['x-orbit-delivery'])).size).toBe(1)
      expect((await sys.notifications.listEndpoints(alice, household))[0]!.failures).toBe(0)
    })

    it('gives up after the last attempt and counts one failure', async () => {
      const { endpoint } = await add()
      sys.webhooks.reply(HOOK, 500)
      const listId = await newList()
      await sys.useCases.addListItem(alice, household, listId, { text: 'Eggs' })
      for (let i = 0; i < MAX_DELIVERY_ATTEMPTS + 2; i++) {
        await sys.notifications.tick()
        advance(60 * MIN)
      }
      expect(sys.webhooks.calls).toHaveLength(MAX_DELIVERY_ATTEMPTS)
      const entries = await log(endpoint)
      expect(entries[0]).toMatchObject({ attempt: MAX_DELIVERY_ATTEMPTS, outcome: 'failed' })
      expect((await sys.notifications.listEndpoints(alice, household))[0]!.failures).toBe(1)
    })

    it.each([408, 429])('retries status %i', async (status) => {
      await add()
      sys.webhooks.reply(HOOK, status, 200)
      const listId = await newList()
      await sys.useCases.addListItem(alice, household, listId, { text: 'Eggs' })
      await sys.notifications.tick()
      advance(60 * 1000)
      await sys.notifications.tick()
      expect(sys.webhooks.calls).toHaveLength(2)
    })

    it('retries a timeout, but not a client error', async () => {
      const { endpoint } = await add()
      sys.webhooks.reply(HOOK, timeout(), 404)
      const listId = await newList()
      await sys.useCases.addListItem(alice, household, listId, { text: 'Eggs' })
      await sys.notifications.tick()
      advance(60 * 1000)
      await sys.notifications.tick()
      advance(60 * MIN)
      await sys.notifications.tick()
      expect(sys.webhooks.calls).toHaveLength(2)
      const entries = (await log(endpoint)).reverse()
      expect(entries.map((e) => e.outcome)).toEqual(['retrying', 'failed'])
      expect(entries[1]).toMatchObject({ httpStatus: 404, error: 'The server answered 404.' })
    })

    it('does not retry an address the egress guard refuses', async () => {
      const { endpoint } = await add()
      sys.webhooks.reply(HOOK, blocked())
      const listId = await newList()
      await sys.useCases.addListItem(alice, household, listId, { text: 'Eggs' })
      await sys.notifications.tick()
      advance(60 * MIN)
      await sys.notifications.tick()
      expect(sys.webhooks.calls).toHaveLength(1)
      expect(await log(endpoint)).toMatchObject([
        { outcome: 'failed', error: 'That address is not allowed.' },
      ])
    })
  })

  describe('switching off', () => {
    it('switches an endpoint off after ten failed deliveries in a row, with a visible reason', async () => {
      const { endpoint } = await add()
      sys.webhooks.reply(HOOK, 404)
      const listId = await newList()
      for (let i = 0; i < AUTO_DISABLE_AFTER_FAILURES; i++) {
        await sys.useCases.addListItem(alice, household, listId, { text: `Item ${i}` })
        await sys.notifications.tick()
      }
      const [off] = await sys.notifications.listEndpoints(alice, household)
      expect(off).toMatchObject({ enabled: false, failures: AUTO_DISABLE_AFTER_FAILURES })
      expect(off!.disabledReason).toContain('The server answered 404.')

      const callsBefore = sys.webhooks.calls.length
      await sys.useCases.addListItem(alice, household, listId, { text: 'More' })
      await sys.notifications.tick()
      expect(sys.webhooks.calls).toHaveLength(callsBefore)

      sys.webhooks.reply(HOOK, 200)
      const back = await sys.notifications.updateEndpoint(alice, household, endpoint.id, {
        enabled: true,
      })
      expect(back).toMatchObject({ enabled: true, failures: 0 })
      await sys.useCases.addListItem(alice, household, listId, { text: 'Again' })
      await sys.notifications.tick()
      expect(sys.webhooks.calls).toHaveLength(callsBefore + 1)
    })

    it('drops a delivery that was queued before the endpoint was switched off', async () => {
      const { endpoint } = await add()
      const listId = await newList()
      await sys.useCases.addListItem(alice, household, listId, { text: 'Eggs' })
      await sys.notifications.updateEndpoint(alice, household, endpoint.id, { enabled: false })
      await sys.notifications.tick()
      expect(sys.webhooks.calls).toEqual([])
    })
  })

  describe('test button', () => {
    it('tries once now, also on a switched-off endpoint, and never counts as a failure', async () => {
      const { endpoint } = await add()
      await sys.notifications.updateEndpoint(alice, household, endpoint.id, { enabled: false })
      sys.webhooks.reply(HOOK, 500)
      const entry = await sys.notifications.sendTest(alice, household, endpoint.id)
      expect(entry).toMatchObject({
        event: 'notification.test',
        outcome: 'failed',
        httpStatus: 500,
      })
      expect(sys.webhooks.calls).toHaveLength(1)
      advance(60 * MIN)
      await sys.notifications.tick()
      expect(sys.webhooks.calls).toHaveLength(1) // not retried
      const [after] = await sys.notifications.listEndpoints(alice, household)
      expect(after!.failures).toBe(0)
    })

    it('reports a delivered test', async () => {
      const { endpoint } = await add()
      expect(await sys.notifications.sendTest(alice, household, endpoint.id)).toMatchObject({
        outcome: 'delivered',
        httpStatus: 200,
      })
      expect(JSON.parse(sys.webhooks.calls[0]!.body!)).toMatchObject({
        event: 'notification.test',
        data: { message: 'This is a test from Orbit.' },
      })
    })
  })

  describe('rate limit', () => {
    it('drops notifications beyond the limit and says so in the log', async () => {
      await setup({ notificationRateLimit: 3 })
      const { endpoint } = await add()
      const listId = await newList()
      for (let i = 0; i < 5; i++)
        await sys.useCases.addListItem(alice, household, listId, { text: `Item ${i}` })
      await sys.notifications.tick()
      expect(sys.webhooks.calls).toHaveLength(3)
      const dropped = (await log(endpoint)).filter((e) => e.outcome === 'dropped')
      expect(dropped).toHaveLength(2)
      expect(dropped[0]!.error).toBe('Too many notifications this minute.')
      advance(61 * 1000)
      await sys.useCases.addListItem(alice, household, listId, { text: 'Later' })
      await sys.notifications.tick()
      expect(sys.webhooks.calls).toHaveLength(4)
    })
  })

  describe('removing an endpoint', () => {
    it('forgets its address, secret, log, queue and reminders', async () => {
      const { endpoint } = await add(['list.item.added', 'calendar.event.starting'])
      const listId = await newList()
      await sys.useCases.addListItem(alice, household, listId, { text: 'Eggs' })
      await sys.notifications.removeEndpoint(alice, household, endpoint.id)
      await sys.notifications.tick()
      expect(sys.webhooks.calls).toEqual([])
      expect(await sys.notifications.listEndpoints(alice, household)).toEqual([])
      expect(
        [...sys.jobs.jobs.keys()].filter((k) => k.startsWith(NOTIFICATION_JOB_PREFIX)),
      ).toEqual([])
      expect(await sys.repos.deliveryLog.recent(endpoint.id, 10)).toEqual([])
    })
  })

  describe('calendar reminders', () => {
    const CAL = 'https://cal.example.com/private/x.ics'
    const timed = (id: string, startMinutesFromNow: number, title = 'Dentist'): CalendarEvent => ({
      kind: 'timed',
      id,
      title,
      start: new Date(T0 + startMinutesFromNow * MIN).toISOString(),
      end: new Date(T0 + (startMinutesFromNow + 30) * MIN).toISOString(),
      isOverride: false,
      isRecurring: false,
    })
    const range = {
      from: new Date(T0 - 60 * MIN),
      to: new Date(T0 + 3 * 24 * 60 * MIN),
    }
    const withCalendar = async (events: CalendarEvent[]) => {
      sys.calendarReader.feeds.set(CAL, events)
      await sys.calendar.addSource(alice, household, { name: 'Family', url: CAL })
      await sys.calendar.events(alice, household, range) // fills the cache the reminders read
    }
    const startingCalls = () =>
      sys.webhooks.calls.filter((c) => c.headers?.['x-orbit-event'] === 'calendar.event.starting')

    it('sends one reminder when an event is within its lead time, and no second one', async () => {
      await add(['calendar.event.starting'], { leadMinutes: 15 })
      await withCalendar([timed('e1', 20)])
      await sys.notifications.tick()
      expect(startingCalls()).toHaveLength(0) // 20 minutes away: too early
      advance(5 * MIN)
      await sys.notifications.tick()
      expect(startingCalls()).toHaveLength(1)
      expect(JSON.parse(startingCalls()[0]!.body!).data).toEqual({
        title: 'Dentist',
        start: new Date(T0 + 20 * MIN).toISOString(),
        end: new Date(T0 + 50 * MIN).toISOString(),
        minutesBefore: 15,
      })
      advance(MIN)
      await sys.notifications.tick()
      await sys.notifications.tick()
      expect(startingCalls()).toHaveLength(1)
    })

    it('does not repeat a reminder after a restart', async () => {
      await add(['calendar.event.starting'])
      await withCalendar([timed('e1', 10)])
      await sys.notifications.tick()
      expect(startingCalls()).toHaveLength(1)

      // A new process: a fresh service over the same stored data, with its own empty memory.
      const restarted = createNotificationService({
        endpoints: sys.repos.notificationEndpoints,
        log: sys.repos.deliveryLog,
        dedupe: sys.repos.notificationDedupe,
        households: sys.repos.households,
        secrets: new InMemorySecretStore(),
        fetcher: sys.webhooks,
        jobs: sys.jobs,
        platform: new FakeNotificationPlatform(),
        calendar: sys.calendar,
        clock: sys.clock,
        ids: { next: () => 'after-restart' },
      })
      advance(MIN)
      await restarted.scanCalendars()
      expect([...sys.jobs.jobs.keys()]).toEqual([])
    })

    it('reminds about each occurrence of a series, and not about all-day or past events', async () => {
      await add(['calendar.event.starting'])
      await withCalendar([
        timed('series@1', 5, 'Standup'),
        timed('series@2', 10, 'Standup'),
        timed('past', -5, 'Gone'),
        {
          kind: 'all-day',
          id: 'holiday',
          title: 'Holiday',
          startDate: '2026-01-01',
          endDate: '2026-01-02',
          isOverride: false,
          isRecurring: false,
        },
      ])
      await sys.notifications.tick()
      expect(startingCalls().map((c) => JSON.parse(c.body!).data.title)).toEqual([
        'Standup',
        'Standup',
      ])
    })

    it('uses each endpoint’s own lead time', async () => {
      await add(['calendar.event.starting'], { leadMinutes: 5 })
      await add(['calendar.event.starting'], {
        leadMinutes: 60,
        url: 'https://other.example.com/h',
      })
      await withCalendar([timed('e1', 30)])
      await sys.notifications.tick()
      expect(startingCalls().map((c) => c.url)).toEqual(['https://other.example.com/h'])
      advance(25 * MIN)
      await sys.notifications.tick()
      expect(startingCalls().map((c) => c.url)).toEqual(['https://other.example.com/h', HOOK])
    })

    it('never makes the calendar server be asked more often than its own cache allows', async () => {
      await add(['calendar.event.starting'])
      await withCalendar([timed('e1', 40)])
      const reads = sys.calendarReader.calls.length
      for (let i = 0; i < 4; i++) {
        advance(MIN)
        await sys.notifications.tick()
      }
      expect(sys.calendarReader.calls.length).toBe(reads)
    })

    it('does not send a notification that is too large', async () => {
      const { endpoint } = await add(['calendar.event.starting'])
      await withCalendar([timed('big', 5, 'x'.repeat(9000))])
      await sys.notifications.tick()
      expect(sys.webhooks.calls).toEqual([])
      expect(await log(endpoint)).toMatchObject([
        { outcome: 'failed', error: 'The notification is too large to send.' },
      ])
    })
  })
})
