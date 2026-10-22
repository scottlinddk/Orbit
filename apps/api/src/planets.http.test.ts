import { createHmac } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createGuardedFetcher } from '@orbit/adapter-egress-guard'
import { SqliteJobScheduler } from '@orbit/adapter-jobs-sqlite'
import { migrate, openDatabase } from '@orbit/adapter-persistence-sqlite'
import { SqlitePlanetStateStore } from '@orbit/adapter-planets-sqlite'
import { EncryptedDbSecretStore } from '@orbit/adapter-secrets-encrypted-db'
import { installPlanet, loadInstalledPlanets, PlanetRuntime } from '@orbit/module-planets/server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createIcalReader, createPlanetWiring } from './planets.ts'
import { createTestEnv, type TestClient, type TestEnv } from './test-support.ts'

const V1 = '/api/v1'
const SECRET = 'sk-live-0123456789'
const KEY = 'k'.repeat(40)

let work: string
let server: http.Server
let port: number
let hits: Array<{ path: string; authorization: string | undefined }>

beforeAll(async () => {
  server = http.createServer((req, res) => {
    hits.push({ path: req.url ?? '', authorization: req.headers.authorization })
    res.setHeader('content-type', 'application/json')
    // A careless API that echoes the credential it was called with.
    res.end(JSON.stringify({ temp: 12, echo: req.headers.authorization ?? null }))
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  port = (server.address() as AddressInfo).port
})
afterAll(async () => {
  server.closeAllConnections()
  await new Promise((done) => server.close(done))
})
beforeEach(() => {
  hits = []
  work = mkdtempSync(join(tmpdir(), 'orbit-planets-http-'))
})
afterEach(() => rmSync(work, { recursive: true, force: true }))

/** Writes a Planet folder and installs it into `<work>/planets`. */
async function installFolder(manifest: Record<string, unknown>, template: string) {
  const folder = join(work, `src-${String(manifest.id)}`)
  mkdirSync(join(folder, 'templates'), { recursive: true })
  writeFileSync(join(folder, 'planet.json'), JSON.stringify(manifest))
  writeFileSync(join(folder, 'templates', 'main.liquid'), template)
  await installPlanet({
    sourceDir: folder,
    planetsDir: join(work, 'planets'),
    orbitVersion: '0.0.0',
    approve: async () => true,
    now: new Date(),
  })
}

const base = {
  schema_version: 1,
  version: '1.0.0',
  name: 'Test',
  authors: ['Tester'],
  license: 'MIT',
  orbit: '*',
  render: { title: 'Test', description: 'A test.', template: 'templates/main.liquid' },
}

function buildRuntime(options: { allowPrivate?: string[] } = {}) {
  const db = openDatabase(':memory:')
  migrate(db)
  const fetcher = createGuardedFetcher({
    allowPrivateHosts: new Set(options.allowPrivate ?? []),
    // Names used by the tests all point at the local test server.
    resolve: async () => [{ address: '127.0.0.1', family: 4 }],
  })
  const secrets = new EncryptedDbSecretStore(db, KEY)
  const runtime = new PlanetRuntime({
    planets: loadInstalledPlanets(join(work, 'planets'), '0.0.0').planets,
    state: new SqlitePlanetStateStore(db),
    scheduler: new SqliteJobScheduler(db),
    secrets,
    clock: { now: () => new Date() },
    fetcher,
    readIcal: createIcalReader(fetcher),
  })
  return { runtime, secrets, db }
}

const weather = (permissions: Record<string, unknown>, host = 'api.example.com') => ({
  ...base,
  id: 'dev.test.weather',
  permissions: { network: [{ host }], secrets: ['api_key'], storage: true, ...permissions },
  data_sources: [
    {
      id: 'now',
      type: 'http_poll',
      url: `http://${host}:${port}/data`,
      headers: { authorization: 'Bearer {secret.api_key}' },
    },
  ],
})

describe('Planet widgets over HTTP', () => {
  let env: TestEnv
  let alice: TestClient
  let bob: TestClient
  let anon: TestClient
  let dashboard: string
  let widgetId: string

  beforeEach(async () => {
    await installFolder(helloManifest(), helloTemplate())
    const { runtime } = buildRuntime()
    env = await createTestEnv({ storage: 'sqlite', planets: runtime })
    alice = env.client()
    bob = env.client()
    anon = env.client()
    await alice.signUp('alice')
    await bob.signUp('bobby')
    const household = (await alice.post(`${V1}/households`, { name: 'Home' })).body.id
    dashboard = (await alice.post(`${V1}/households/${household}/dashboards`, { name: 'Main' }))
      .body.id
    const added = await alice.post(`${V1}/dashboards/${dashboard}/widgets`, {
      type: 'planet.dev.orbit.hello',
      config: { name: 'Sam <b>' },
    })
    expect(added.status).toBe(201)
    widgetId = added.body.widgets[0].id
  })
  afterEach(() => env.close())

  const render = (client: TestClient, id = widgetId) =>
    client.get(`${V1}/dashboards/${dashboard}/widgets/${id}/planet`)

  it('lists installed Planets as widgets with their forms', async () => {
    const res = await alice.get(`${V1}/planets/widgets`)
    expect(res.status).toBe(200)
    expect(res.body.widgets).toEqual([
      expect.objectContaining({
        type: 'planet.dev.orbit.hello',
        title: 'Hello',
        options: expect.arrayContaining([expect.objectContaining({ key: 'name', kind: 'text' })]),
      }),
    ])
    expect((await anon.get(`${V1}/planets/widgets`)).status).toBe(401)
  })

  it('renders escaped output for a member', async () => {
    const res = await render(alice)
    expect(res.status).toBe(200)
    expect(res.body.html).toContain('Hello, Sam &lt;b&gt;')
    expect(res.body).toMatchObject({ stale: false })
  })

  it('answers 404 to another household and 401 to anonymous callers (household isolation)', async () => {
    expect((await render(bob)).status).toBe(404)
    expect((await render(anon)).status).toBe(401)
    expect((await render(alice, 'no-such-widget')).status).toBe(404)
  })

  it('answers 404 for a widget that is not a Planet, or whose Planet is gone', async () => {
    const other = await alice.post(`${V1}/dashboards/${dashboard}/widgets`, {
      type: 'budget.balance',
    })
    const budget = other.body.widgets.find((w: { type: string }) => w.type === 'budget.balance')
    expect((await render(alice, budget.id)).status).toBe(404)

    const gone = await createTestEnv({ storage: 'sqlite' })
    try {
      const a = gone.client()
      await a.signUp('alice')
      const household = (await a.post(`${V1}/households`, { name: 'H' })).body.id
      const d = (await a.post(`${V1}/households/${household}/dashboards`, { name: 'D' })).body.id
      const w = (await a.post(`${V1}/dashboards/${d}/widgets`, { type: 'planet.dev.orbit.hello' }))
        .body.widgets[0].id
      expect((await a.get(`${V1}/dashboards/${d}/widgets/${w}/planet`)).status).toBe(404)
      expect((await a.get(`${V1}/planets/widgets`)).body.widgets).toEqual([])
    } finally {
      await gone.close()
    }
  })
})

describe('webhook route', () => {
  const hookPlanet = {
    ...base,
    id: 'dev.test.hook',
    permissions: { storage: true, secrets: ['signing'] },
    data_sources: [{ id: 'push', type: 'webhook', max_bytes: 1024, hmac_secret: 'signing' }],
  }
  let env: TestEnv
  let token: string
  const target = { planetId: 'dev.test.hook', placementId: 'w1', sourceId: 'push' }
  const sign = (body: string, key = 'a-long-signing-key') =>
    `sha256=${createHmac('sha256', key).update(body).digest('hex')}`

  beforeEach(async () => {
    await installFolder(hookPlanet, '{{ data.push.value }}')
    const { runtime, secrets } = buildRuntime()
    await secrets.set('planet:dev.test.hook', 'signing', 'a-long-signing-key')
    token = await runtime.createWebhookToken(target)
    env = await createTestEnv({ planets: runtime })
  })
  afterEach(() => env.close())

  const post = (t: string, body: string, signature?: string) =>
    env.app.inject({
      method: 'POST',
      url: `${V1}/planet-hooks/${t}`,
      headers: {
        'content-type': 'application/json',
        ...(signature ? { 'x-orbit-signature': signature } : {}),
      },
      payload: body,
    })

  it('accepts a signed payload without a session, and shows it in the rendered output', async () => {
    const body = '{"value":"hello"}'
    const res = await post(token, body, sign(body))
    expect(res.statusCode).toBe(204)
    expect(await env.services.planets?.render('dev.test.hook', 'w1', {})).toMatchObject({
      html: 'hello',
    })
  })

  it('rejects a missing or wrong signature, an oversized body and bad JSON', async () => {
    const body = '{"value":"hello"}'
    expect((await post(token, body)).statusCode).toBe(401)
    expect((await post(token, body, sign(body, 'another-long-signing-key'))).statusCode).toBe(401)
    const big = JSON.stringify({ value: 'x'.repeat(2000) })
    expect((await post(token, big, sign(big))).statusCode).toBe(413)
    expect((await post(token, 'nope', sign('nope'))).statusCode).toBe(400)
  })

  it('answers an unknown token with a plain 404', async () => {
    const res = await post('x'.repeat(43), '{}')
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body)).toMatchObject({ status: 404 })
  })
})

describe('egress through the real guard', () => {
  const renderWeather = async (
    manifest: Record<string, unknown>,
    options: { allowPrivate?: string[] } = {},
  ) => {
    await installFolder(manifest, '{{ data.now | json }}')
    const { runtime, secrets } = buildRuntime(options)
    await secrets.set('planet:dev.test.weather', 'api_key', SECRET)
    return runtime.render('dev.test.weather', 'w1', {})
  }

  it('blocks a private destination by default and never contacts it', async () => {
    const rendered = await renderWeather(weather({}))
    expect(rendered.error).toBe('That address is not allowed.')
    expect(hits).toEqual([])
  })

  it('blocks it for a Planet without the lan permission even when the administrator allowed the host', async () => {
    const rendered = await renderWeather(weather({}), { allowPrivate: ['api.example.com'] })
    expect(rendered.error).toBe('That address is not allowed.')
    expect(hits).toEqual([])
  })

  it('blocks metadata and RFC1918 literals, which the manifest can name but the guard refuses', async () => {
    for (const host of ['169.254.169.254', '10.0.0.5', '127.0.0.1']) {
      const rendered = await renderWeather(weather({}, host), { allowPrivate: [host] })
      expect(rendered.error, host).toBe('That address is not allowed.')
    }
    expect(hits).toEqual([])
  })

  it('reaches a LAN host only when the Planet declares lan and the administrator allowed that host', async () => {
    const rendered = await renderWeather(weather({ lan: true }), {
      allowPrivate: ['api.example.com'],
    })
    expect(rendered.error).toBeUndefined()
    expect(hits).toHaveLength(1)
    expect(hits[0]?.authorization).toBe(`Bearer ${SECRET}`)
  })

  it('removes the secret the server echoed back before anything is stored or shown', async () => {
    const rendered = await renderWeather(weather({ lan: true }), {
      allowPrivate: ['api.example.com'],
    })
    expect(rendered.html).not.toContain(SECRET)
    expect(rendered.html).toContain('[redacted]')
  })
})

describe('createPlanetWiring', () => {
  it('loads installed Planets and refuses one whose files were changed after install', async () => {
    await installFolder(helloManifest(), helloTemplate())
    const db = openDatabase(':memory:')
    migrate(db)
    const config = {
      planetsDir: join(work, 'planets'),
      secretKey: KEY,
      egressAllowPrivateHosts: new Set<string>(),
    }
    expect(createPlanetWiring(db, config).runtime.widgets()).toHaveLength(1)

    writeFileSync(
      join(work, 'planets', 'installed', 'dev.orbit.hello', 'templates', 'main.liquid'),
      '<script>steal()</script>',
    )
    const wiring = createPlanetWiring(db, config)
    expect(wiring.runtime.widgets()).toEqual([])
    expect(wiring.refused).toEqual([
      { id: 'dev.orbit.hello', reason: expect.stringContaining('digest mismatch') },
    ])
  })

  it('keeps running with no Planets when planets.lock is damaged', () => {
    mkdirSync(join(work, 'planets'), { recursive: true })
    writeFileSync(join(work, 'planets', 'planets.lock'), '{ nope')
    const db = openDatabase(':memory:')
    migrate(db)
    const wiring = createPlanetWiring(db, {
      planetsDir: join(work, 'planets'),
      secretKey: undefined,
      egressAllowPrivateHosts: new Set(),
    })
    expect(wiring.runtime.widgets()).toEqual([])
    expect(wiring.lockProblem).toContain('planets.lock')
  })
})

function helloManifest(): Record<string, unknown> {
  return {
    ...base,
    id: 'dev.orbit.hello',
    name: 'Hello',
    render: { title: 'Hello', description: 'Greets.', template: 'templates/main.liquid' },
    config_schema: [{ key: 'name', label: 'Name', kind: 'text', maxLength: 40, default: 'you' }],
  }
}
const helloTemplate = () => '<p>Hello, {{ config.name }}</p>'
