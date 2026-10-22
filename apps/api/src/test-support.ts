import {
  CounterIdGenerator,
  InsecureTestPasswordHasher,
  ManualClock,
  SequentialSessionTokens,
} from '@orbit/adapter-in-memory'
import type { Auth, OidcProvider, SetupGate, UseCases } from '@orbit/application'
import { SqliteJobScheduler } from '@orbit/adapter-jobs-sqlite'
import { migrate, openDatabase } from '@orbit/adapter-persistence-sqlite'
import { SqlitePlanetStateStore } from '@orbit/adapter-planets-sqlite'
import { EncryptedDbSecretStore } from '@orbit/adapter-secrets-encrypted-db'
import { buildPackage, PlanetRuntime } from '@orbit/module-planets/server'
import { createInMemoryRepositories, createSqliteRepositories } from '@orbit/testing'
import type { LightMyRequestResponse } from 'fastify'
import { buildApp, type AppOptions, type App } from './app.ts'
import { loadConfig, type Config } from './config.ts'
import { cookieName } from './http/session.ts'
import { assembleServices, type Services } from './services.ts'

export const PASSWORD = 'correct horse battery'

export interface TestEnv {
  app: App
  config: Config
  clock: ManualClock
  services: Services
  client(): TestClient
  close(): Promise<void>
}

export interface TestEnvOptions {
  storage?: 'memory' | 'sqlite'
  env?: Record<string, string>
  app?: Partial<AppOptions>
  setupGate?: SetupGate
  planets?: PlanetRuntime
  oidc?: OidcProvider
}

/** The real HTTP app wired with fast, deterministic parts. Registration is open by default. */
export async function createTestEnv(options: TestEnvOptions = {}): Promise<TestEnv> {
  const config = loadConfig({ ORBIT_REGISTRATION: 'open', ...options.env })
  const clock = new ManualClock()
  const services = assembleServices({
    repos: options.storage === 'sqlite' ? createSqliteRepositories() : createInMemoryRepositories(),
    hasher: new InsecureTestPasswordHasher(),
    tokens: new SequentialSessionTokens(),
    clock,
    ids: new CounterIdGenerator(),
    registrationPolicy: config.registration,
    setupGate: options.setupGate,
    planets: options.planets,
    oidc: options.oidc,
    localLoginEnabled: config.localLogin,
  })
  const app = await buildApp({
    services,
    config,
    // Generous limits, so only the dedicated rate-limit test ever hits one.
    authRateLimit: { max: 1000, timeWindow: '1 minute' },
    generalRateLimit: { max: 10_000, timeWindow: '1 minute' },
    ...options.app,
  })
  await app.ready()
  return {
    app,
    config,
    clock,
    services,
    client: () => new TestClient(app, config),
    close: () => app.close(),
  }
}

/**
 * A Planet runtime on a throwaway SQLite database with one installed Planet that needs no
 * network: `dev.test.static`, which greets from a static data source.
 */
export function createTestPlanets(): PlanetRuntime {
  const db = openDatabase(':memory:')
  migrate(db)
  const manifest = {
    schema_version: 1,
    id: 'dev.test.static',
    version: '1.0.0',
    name: 'Static',
    authors: ['Tests'],
    license: 'Apache-2.0',
    orbit: '*',
    data_sources: [{ id: 'greeting', type: 'static', data: 'Hi <there>' }],
    render: { title: 'Static', description: 'A test Planet.', template: 'templates/main.liquid' },
  }
  return new PlanetRuntime({
    planets: [
      buildPackage([
        { path: 'planet.json', content: Buffer.from(JSON.stringify(manifest)) },
        { path: 'templates/main.liquid', content: Buffer.from('<p>{{ data.greeting }}</p>') },
      ]),
    ],
    state: new SqlitePlanetStateStore(db),
    scheduler: new SqliteJobScheduler(db),
    secrets: new EncryptedDbSecretStore(db, 'k'.repeat(40)),
    clock: { now: () => new Date() },
    fetcher: {
      fetchText: async () => {
        throw new Error('The test Planet must not use the network')
      },
    },
    readIcal: async () => [],
  })
}

export interface Reply {
  status: number
  body: any
  headers: LightMyRequestResponse['headers']
  raw: LightMyRequestResponse
}

/** A browser stand-in: keeps its own cookie jar, so several clients model several people. */
export class TestClient {
  cookie: string | undefined
  readonly #app: App
  readonly #config: Config

  constructor(app: App, config: Config) {
    this.#app = app
    this.#config = config
  }

  async request(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<Reply> {
    const raw = await this.#app.inject({
      method,
      url,
      headers: {
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
      ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
    })
    const name = cookieName(this.#config)
    for (const c of raw.cookies) {
      if (c.name !== name) continue
      this.cookie = c.value ? `${name}=${c.value}` : undefined
    }
    const text = raw.body
    return {
      status: raw.statusCode,
      body: text ? safeJson(text) : undefined,
      headers: raw.headers,
      raw,
    }
  }

  get = (url: string, headers?: Record<string, string>) =>
    this.request('GET', url, undefined, headers)
  post = (url: string, body?: unknown, headers?: Record<string, string>) =>
    this.request('POST', url, body ?? {}, headers)
  put = (url: string, body: unknown) => this.request('PUT', url, body)
  delete = (url: string) => this.request('DELETE', url)

  /** Registers (open policy) and signs in. */
  async signUp(username: string): Promise<{ id: string }> {
    const registered = await this.post('/api/v1/auth/register', { username, password: PASSWORD })
    if (registered.status !== 201) throw new Error(`register ${username}: ${registered.status}`)
    const login = await this.post('/api/v1/auth/login', { username, password: PASSWORD })
    if (login.status !== 200) throw new Error(`login ${username}: ${login.status}`)
    return registered.body
  }
}

const safeJson = (text: string) => {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export type { Auth, UseCases }
