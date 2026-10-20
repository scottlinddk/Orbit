import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Argon2PasswordHasher, RandomSessionTokens } from '@orbit/adapter-identity-local'
import {
  SqliteAccountRepository,
  SqliteDashboardRepository,
  SqliteHouseholdRepository,
  SqliteSessionStore,
  SqliteUserRepository,
  migrate,
  openDatabase,
  type Database,
} from '@orbit/adapter-persistence-sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp, type App } from './app.ts'
import { loadConfig } from './config.ts'
import { assembleServices } from './services.ts'
import { TestClient, PASSWORD } from './test-support.ts'

/** The production wiring from main.ts, minus the network listener: real Argon2, a real SQLite file. */
describe('production wiring', () => {
  let dir: string
  let db: Database
  let app: App
  const config = loadConfig({ ORBIT_REGISTRATION: 'first-user-only' })

  const start = async (path: string) => {
    db = openDatabase(path)
    migrate(db)
    app = await buildApp({
      config,
      services: assembleServices({
        repos: {
          users: new SqliteUserRepository(db),
          accounts: new SqliteAccountRepository(db),
          sessions: new SqliteSessionStore(db),
          households: new SqliteHouseholdRepository(db),
          dashboards: new SqliteDashboardRepository(db),
        },
        hasher: new Argon2PasswordHasher(),
        tokens: new RandomSessionTokens(),
        clock: { now: () => new Date() },
        ids: { next: () => randomUUID() },
        registrationPolicy: config.registration,
      }),
    })
    await app.ready()
  }
  const stop = async () => {
    await app.close()
    db.close()
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'orbit-e2e-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('keeps accounts, sessions and dashboards across a restart', async () => {
    const path = join(dir, 'orbit.sqlite')
    await start(path)
    const alice = new TestClient(app, config)
    await alice.signUp('alice')
    const household = (await alice.post('/api/v1/households', { name: 'Home' })).body.id
    const dashboard = (
      await alice.post(`/api/v1/households/${household}/dashboards`, { name: 'Week' })
    ).body
    await alice.post(`/api/v1/dashboards/${dashboard.id}/widgets`, { type: 'calendar.agenda' })
    const cookie = alice.cookie
    await stop()

    await start(path)
    const again = new TestClient(app, config)
    again.cookie = cookie
    const loaded = await again.get(`/api/v1/dashboards/${dashboard.id}`)
    expect(loaded.status).toBe(200)
    expect(loaded.body.widgets).toHaveLength(1)

    const fresh = new TestClient(app, config)
    expect(
      (await fresh.post('/api/v1/auth/login', { username: 'alice', password: PASSWORD })).status,
    ).toBe(200)
    await stop()
  })

  it('stores only an Argon2id hash, never the password or the session token', async () => {
    const path = join(dir, 'orbit.sqlite')
    await start(path)
    const alice = new TestClient(app, config)
    await alice.signUp('alice')
    const token = alice.cookie!.split('=')[1]!

    const creds = db.prepare('SELECT password_hash FROM credentials').all() as {
      password_hash: string
    }[]
    expect(creds).toHaveLength(1)
    expect(creds[0]!.password_hash).toMatch(/^\$argon2id\$/)
    expect(creds[0]!.password_hash).not.toContain(PASSWORD)

    const sessions = db.prepare('SELECT token_hash FROM sessions').all() as { token_hash: string }[]
    expect(sessions).toHaveLength(1)
    expect(sessions[0]!.token_hash).not.toBe(token)
    expect(sessions[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/)
    await stop()
  })

  it('closes registration after the first account', async () => {
    await start(join(dir, 'orbit.sqlite'))
    const c = new TestClient(app, config)
    await c.signUp('alice')
    const second = await c.post('/api/v1/auth/register', { username: 'bobby', password: PASSWORD })
    expect(second.status).toBe(403)
    await stop()
  })
})
