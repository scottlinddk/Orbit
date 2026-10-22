import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { EgressDeniedError, NotFoundError } from '@orbit/application'
import { beforeEach, describe, expect, it } from 'vitest'
import { PlanetRuntime, WebhookRejectedError } from './runtime.ts'
import { buildPackage, readPlanetFolder } from './package-folder.ts'
import {
  MemoryPlanetState,
  MemoryScheduler,
  MemorySecretStore,
  ScriptedFetcher,
} from './test-doubles.ts'

const HELLO = new URL('../../fixtures/hello', import.meta.url).pathname

const buildPlanet = (manifest: Record<string, unknown>, template: string) =>
  buildPackage([
    { path: 'planet.json', content: Buffer.from(JSON.stringify(manifest)) },
    { path: 'templates/main.liquid', content: Buffer.from(template) },
  ])

const base = {
  schema_version: 1,
  version: '1.0.0',
  name: 'Test',
  authors: ['Tester'],
  license: 'MIT',
  orbit: '*',
  render: { title: 'Test', description: 'A test.', template: 'templates/main.liquid' },
}

const SECRET = 'sk-live-0123456789'
const weatherManifest = {
  ...base,
  id: 'dev.test.weather',
  permissions: { network: [{ host: 'api.example.com' }], secrets: ['api_key'], storage: true },
  config_schema: [{ key: 'city', label: 'City', kind: 'text', maxLength: 40, default: 'Aarhus' }],
  data_sources: [
    {
      id: 'now',
      type: 'http_poll',
      url: 'https://api.example.com/v1/{config.city}',
      headers: { authorization: 'Bearer {secret.api_key}' },
    },
  ],
  refresh: {
    interval_seconds: 600,
    min_interval_seconds: 300,
    jitter_percent: 0,
    backoff_max_seconds: 3600,
  },
}
const weatherTemplate = '<p>{{ data.now.temp }} in {{ config.city }}</p>'

let clock: { value: Date; now(): Date }
let secrets: MemorySecretStore
let scheduler: MemoryScheduler
let state: MemoryPlanetState

beforeEach(() => {
  clock = {
    value: new Date('2026-03-01T10:00:00Z'),
    now() {
      return this.value
    },
  }
  secrets = new MemorySecretStore()
  scheduler = new MemoryScheduler()
  state = new MemoryPlanetState()
})

const advance = (seconds: number) => {
  clock.value = new Date(clock.value.getTime() + seconds * 1000)
}

function runtime(
  fetcher: ScriptedFetcher,
  planets = [buildPlanet(weatherManifest, weatherTemplate)],
) {
  return new PlanetRuntime({
    planets,
    state,
    secrets,
    scheduler,
    clock,
    random: () => 0,
    fetcher,
    readIcal: async () => [],
  })
}

describe('rendering', () => {
  it('renders the fixture Planet against its examples/ data', async () => {
    const pkg = readPlanetFolder(HELLO)
    const example = JSON.parse(readFileSync(`${HELLO}/examples/data.json`, 'utf8')) as {
      config: Record<string, unknown>
      expect_contains: string[]
    }
    const rendered = await runtime(new ScriptedFetcher(() => ({})), [pkg]).render(
      'dev.orbit.hello',
      'p1',
      example.config,
    )
    for (const expected of example.expect_contains) expect(rendered.html).toContain(expected)
    expect(rendered.stale).toBe(false)
  })

  it('offers one widget per Planet, with the config form as widget options', () => {
    const [widget] = runtime(new ScriptedFetcher(() => ({}))).widgets()
    expect(widget).toMatchObject({
      type: 'planet.dev.test.weather',
      options: [{ key: 'city', kind: 'text', default: 'Aarhus' }],
    })
  })

  it('answers not found for a Planet that is not installed', async () => {
    await expect(
      runtime(new ScriptedFetcher(() => ({}))).render('dev.nope.x', 'p', {}),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('falls back to defaults for config values that do not fit the form', async () => {
    await secrets.set('planet:dev.test.weather', 'api_key', SECRET)
    const fetcher = new ScriptedFetcher(() => ({ body: '{"temp": 4}' }))
    const rendered = await runtime(fetcher).render('dev.test.weather', 'p1', { city: 42 })
    expect(rendered.html).toBe('<p>4 in Aarhus</p>')
  })
})

describe('http_poll', () => {
  it('goes through the egress port with the manifest hosts, the lan flag and the filled-in URL', async () => {
    await secrets.set('planet:dev.test.weather', 'api_key', SECRET)
    const fetcher = new ScriptedFetcher(() => ({ body: '{"temp": 7}' }))
    const rendered = await runtime(fetcher).render('dev.test.weather', 'p1', { city: 'Århus & Co' })
    expect(rendered.html).toBe('<p>7 in Århus &amp; Co</p>')
    expect(fetcher.requests).toHaveLength(1)
    expect(fetcher.requests[0]).toMatchObject({
      url: 'https://api.example.com/v1/%C3%85rhus%20%26%20Co',
      allowedHosts: ['api.example.com'],
      allowPrivate: false,
      maxBytes: 262_144,
      headers: { authorization: `Bearer ${SECRET}` },
    })
  })

  it('never puts a secret into the template context, the stored state or the output', async () => {
    await secrets.set('planet:dev.test.weather', 'api_key', SECRET)
    const planet = buildPlanet(
      weatherManifest,
      '{{ secrets | json }}{{ secret }}{{ config | json }}{{ data | json }}{{ planet | json }}',
    )
    const fetcher = new ScriptedFetcher(() => ({ body: '{"temp": 7}' }))
    const rendered = await runtime(fetcher, [planet]).render('dev.test.weather', 'p1', {})
    expect(rendered.html).not.toContain(SECRET)
    expect(rendered.html).not.toContain('api_key')
    expect(JSON.stringify([...state.states.values()])).not.toContain(SECRET)
    expect(JSON.stringify([...scheduler.jobs.values()])).not.toContain(SECRET)
  })

  it('removes a secret that the server echoes back (secret-echo test)', async () => {
    await secrets.set('planet:dev.test.weather', 'api_key', SECRET)
    const fetcher = new ScriptedFetcher((request) => ({
      body: JSON.stringify({ temp: 3, echo: request.headers?.authorization, [SECRET]: 'as a key' }),
    }))
    const planet = buildPlanet(weatherManifest, '{{ data.now | json }}')
    const rendered = await runtime(fetcher, [planet]).render('dev.test.weather', 'p1', {})
    expect(rendered.html).not.toContain(SECRET)
    expect(rendered.html).toContain('[redacted]')
    expect(JSON.stringify([...state.states.values()])).not.toContain(SECRET)
  })

  it('reports a missing secret without naming any value', async () => {
    const fetcher = new ScriptedFetcher(() => ({ body: '{}' }))
    const rendered = await runtime(fetcher).render('dev.test.weather', 'p1', {})
    expect(rendered.error).toContain('orbit planet secret set dev.test.weather api_key')
    expect(fetcher.requests).toHaveLength(0)
  })

  it('keeps the last good data when a refresh fails, and says it is stale', async () => {
    await secrets.set('planet:dev.test.weather', 'api_key', SECRET)
    let fail = false
    const fetcher = new ScriptedFetcher(() =>
      fail
        ? new EgressDeniedError('timeout', 'The request took too long.')
        : { body: '{"temp": 7}' },
    )
    const rt = runtime(fetcher)
    expect((await rt.render('dev.test.weather', 'p1', {})).html).toBe('<p>7 in Aarhus</p>')

    fail = true
    advance(700)
    expect(await rt.tick()).toBe(1)
    const rendered = await rt.render('dev.test.weather', 'p1', {})
    expect(rendered.html).toBe('<p>7 in Aarhus</p>')
    expect(rendered).toMatchObject({ stale: true, error: 'The request took too long.' })
  })

  it('backs off after failures, never earlier than min_interval, and recovers on success', async () => {
    await secrets.set('planet:dev.test.weather', 'api_key', SECRET)
    let fail = true
    const fetcher = new ScriptedFetcher(() =>
      fail
        ? new EgressDeniedError('network', 'The server could not be reached.')
        : { body: '{"temp": 1}' },
    )
    const rt = runtime(fetcher)
    const nextIn = () =>
      ((scheduler.jobs.get('planet:dev.test.weather:p1')?.runAt.getTime() ?? 0) -
        clock.value.getTime()) /
      1000

    await rt.render('dev.test.weather', 'p1', {})
    expect(nextIn()).toBe(1200) // 600 s interval, doubled once
    advance(1300)
    await rt.tick()
    expect(nextIn()).toBe(2400)
    advance(2500)
    await rt.tick()
    expect(nextIn()).toBe(3600) // capped at backoff_max_seconds

    fail = false
    advance(3700)
    await rt.tick()
    expect(nextIn()).toBe(600)
    expect((await state.get('dev.test.weather', 'p1'))?.failures).toBe(0)
  })

  it('does not fetch again before the job is due, however often it renders', async () => {
    await secrets.set('planet:dev.test.weather', 'api_key', SECRET)
    const fetcher = new ScriptedFetcher(() => ({ body: '{"temp": 1}' }))
    const rt = runtime(fetcher)
    for (let i = 0; i < 5; i += 1) await rt.render('dev.test.weather', 'p1', {})
    expect(await rt.tick()).toBe(0)
    expect(fetcher.requests).toHaveLength(1)
  })

  it('refreshes soon after the widget is configured differently', async () => {
    await secrets.set('planet:dev.test.weather', 'api_key', SECRET)
    const fetcher = new ScriptedFetcher(() => ({ body: '{"temp": 1}' }))
    const rt = runtime(fetcher)
    await rt.render('dev.test.weather', 'p1', { city: 'Aarhus' })
    await rt.render('dev.test.weather', 'p1', { city: 'Odense' })
    expect(await rt.tick()).toBe(1)
    expect(fetcher.requests.at(-1)?.url).toContain('/Odense')
  })

  it('keeps state in memory only when the Planet did not ask for storage', async () => {
    const manifest = {
      ...weatherManifest,
      permissions: { network: [{ host: 'api.example.com' }], secrets: ['api_key'] },
    }
    await secrets.set('planet:dev.test.weather', 'api_key', SECRET)
    const fetcher = new ScriptedFetcher(() => ({ body: '{"temp": 1}' }))
    const rendered = await runtime(fetcher, [buildPlanet(manifest, weatherTemplate)]).render(
      'dev.test.weather',
      'p1',
      {},
    )
    expect(rendered.html).toBe('<p>1 in Aarhus</p>')
    expect(state.states.size).toBe(0)
  })
})

describe('ical', () => {
  it('reads events through the injected reader with the manifest rules', async () => {
    const manifest = {
      ...base,
      id: 'dev.test.agenda',
      permissions: { network: [{ host: 'cal.example.com' }], storage: true },
      data_sources: [
        {
          id: 'events',
          type: 'ical',
          url: 'https://cal.example.com/home.ics',
          days_ahead: 7,
          max_events: 2,
        },
      ],
    }
    const seen: unknown[] = []
    const rt = new PlanetRuntime({
      planets: [
        buildPlanet(manifest, '{% for e in data.events %}<li>{{ e.title }}</li>{% endfor %}'),
      ],
      state,
      secrets,
      scheduler,
      clock,
      random: () => 0,
      fetcher: new ScriptedFetcher(() => ({})),
      readIcal: async (request) => {
        seen.push(request)
        return [{ title: 'Dentist <b>' }, { title: 'School' }, { title: 'Dropped' }]
      },
    })
    const rendered = await rt.render('dev.test.agenda', 'p1', {})
    expect(rendered.html).toBe('<li>Dentist &lt;b&gt;</li><li>School</li>')
    expect(seen[0]).toMatchObject({
      url: 'https://cal.example.com/home.ics',
      allowedHosts: ['cal.example.com'],
      allowPrivate: false,
      maxEvents: 2,
    })
  })
})

describe('webhook', () => {
  const hookManifest = (extra: Record<string, unknown> = {}) => ({
    ...base,
    id: 'dev.test.hook',
    permissions: { storage: true, secrets: ['signing'] },
    data_sources: [{ id: 'push', type: 'webhook', max_bytes: 1024, ...extra }],
  })
  const template = '{{ data.push.value }}'
  const target = { planetId: 'dev.test.hook', placementId: 'p1', sourceId: 'push' }

  it('stores a payload posted to the unguessable URL token, which is kept only as a hash', async () => {
    const rt = runtime(new ScriptedFetcher(() => ({})), [buildPlanet(hookManifest(), template)])
    const token = await rt.createWebhookToken(target)
    expect(token.length).toBeGreaterThanOrEqual(43)
    expect([...state.webhooks.keys()].join()).not.toContain(token)
    await rt.receiveWebhook({ token, body: '{"value": "<hi>"}', signature: undefined })
    expect((await rt.render('dev.test.hook', 'p1', {})).html).toBe('&lt;hi&gt;')
  })

  it('answers not found for an unknown or replaced token', async () => {
    const rt = runtime(new ScriptedFetcher(() => ({})), [buildPlanet(hookManifest(), template)])
    const first = await rt.createWebhookToken(target)
    await rt.createWebhookToken(target)
    for (const token of ['nope', first]) {
      await expect(
        rt.receiveWebhook({ token, body: '{}', signature: undefined }),
      ).rejects.toBeInstanceOf(NotFoundError)
    }
  })

  it('rejects a payload above the size cap, and one that is not JSON', async () => {
    const rt = runtime(new ScriptedFetcher(() => ({})), [buildPlanet(hookManifest(), template)])
    const token = await rt.createWebhookToken(target)
    const big = JSON.stringify({ value: 'x'.repeat(1100) })
    await expect(
      rt.receiveWebhook({ token, body: big, signature: undefined }),
    ).rejects.toMatchObject({
      status: 413,
    })
    await expect(
      rt.receiveWebhook({ token, body: 'nope', signature: undefined }),
    ).rejects.toMatchObject({
      status: 400,
    })
    expect(state.states.size).toBe(0)
  })

  it('checks the HMAC when the source asks for one', async () => {
    const rt = runtime(new ScriptedFetcher(() => ({})), [
      buildPlanet(hookManifest({ hmac_secret: 'signing' }), template),
    ])
    await secrets.set('planet:dev.test.hook', 'signing', 'a-long-signing-key')
    const token = await rt.createWebhookToken(target)
    const body = '{"value": "ok"}'
    const good = `sha256=${createHmac('sha256', 'a-long-signing-key').update(body).digest('hex')}`
    for (const signature of [undefined, 'sha256=00', good.replace(/.$/, '0')]) {
      await expect(rt.receiveWebhook({ token, body, signature })).rejects.toBeInstanceOf(
        WebhookRejectedError,
      )
    }
    await rt.receiveWebhook({ token, body, signature: good })
    expect((await rt.render('dev.test.hook', 'p1', {})).html).toBe('ok')
  })
})

describe('uninstall leaves nothing behind', () => {
  it('removes state, webhook tokens, secrets and scheduled jobs of the Planet only', async () => {
    const hook = buildPlanet(
      {
        ...base,
        id: 'dev.test.hook',
        permissions: { storage: true },
        data_sources: [{ id: 'push', type: 'webhook' }],
      },
      '{{ data.push.value }}',
    )
    const rt = runtime(new ScriptedFetcher(() => ({ body: '{"temp": 1}' })), [
      buildPlanet(weatherManifest, weatherTemplate),
      hook,
    ])
    await rt.setSecret('dev.test.weather', 'api_key', SECRET)
    await rt.render('dev.test.weather', 'p1', {})
    const token = await rt.createWebhookToken({
      planetId: 'dev.test.hook',
      placementId: 'p1',
      sourceId: 'push',
    })
    await rt.receiveWebhook({ token, body: '{"value": 1}', signature: undefined })
    expect(scheduler.jobs.size).toBe(1)

    await rt.removeData('dev.test.weather')
    expect(secrets.values.size).toBe(0)
    expect(scheduler.jobs.size).toBe(0)
    expect(await state.get('dev.test.weather', 'p1')).toBeUndefined()
    // Another Planet's data is untouched.
    expect(await state.get('dev.test.hook', 'p1')).toBeDefined()

    await rt.removeData('dev.test.hook')
    expect(state.states.size).toBe(0)
    expect(state.webhooks.size).toBe(0)
  })

  it('only accepts secrets the manifest declared, and not short ones', async () => {
    const rt = runtime(new ScriptedFetcher(() => ({})))
    await expect(rt.setSecret('dev.test.weather', 'other', SECRET)).rejects.toThrow(
      /does not declare/,
    )
    await expect(rt.setSecret('dev.test.weather', 'api_key', 'short')).rejects.toThrow(/at least/)
    await expect(rt.setSecret('dev.nope.x', 'api_key', SECRET)).rejects.toThrow(/No Planet/)
  })
})
