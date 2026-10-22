import { migrate, openDatabase } from '@orbit/adapter-persistence-sqlite'
import { SqliteJobScheduler } from '@orbit/adapter-jobs-sqlite'
import { SqlitePlanetStateStore } from '@orbit/adapter-planets-sqlite'
import { EncryptedDbSecretStore, SecretKeyError } from '@orbit/adapter-secrets-encrypted-db'
import { beforeEach, describe, expect, it } from 'vitest'

const KEY = 'k'.repeat(40)
let db: ReturnType<typeof openDatabase>

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db)
})

describe('EncryptedDbSecretStore', () => {
  it('stores ciphertext, never the value, and reads it back', async () => {
    const store = new EncryptedDbSecretStore(db, KEY)
    await store.set('planet:a', 'api_key', 'sk-live-super-secret')
    const row = db.prepare('SELECT * FROM secrets').get() as { ciphertext: string }
    expect(JSON.stringify(row)).not.toContain('super-secret')
    expect(await store.get('planet:a', 'api_key')).toBe('sk-live-super-secret')
    expect(await store.get('planet:a', 'other')).toBeUndefined()
    expect(await store.names('planet:a')).toEqual(['api_key'])
  })

  it('does not decrypt with another key, or when moved to another name or scope', async () => {
    const store = new EncryptedDbSecretStore(db, KEY)
    await store.set('planet:a', 'api_key', 'sk-live-super-secret')
    await expect(
      new EncryptedDbSecretStore(db, 'z'.repeat(40)).get('planet:a', 'api_key'),
    ).rejects.toBeInstanceOf(SecretKeyError)
    db.prepare("UPDATE secrets SET name = 'moved'").run()
    await expect(store.get('planet:a', 'moved')).rejects.toBeInstanceOf(SecretKeyError)
  })

  it('refuses a short master key, replaces on set, and deletes a whole scope', async () => {
    expect(() => new EncryptedDbSecretStore(db, 'short')).toThrow(SecretKeyError)
    const store = new EncryptedDbSecretStore(db, KEY)
    await store.set('planet:a', 'k', 'first-value-1')
    await store.set('planet:a', 'k', 'second-value-2')
    await store.set('planet:b', 'k', 'other-value-3')
    expect(await store.get('planet:a', 'k')).toBe('second-value-2')
    await store.deleteScope('planet:a')
    expect(await store.names('planet:a')).toEqual([])
    expect(await store.get('planet:b', 'k')).toBe('other-value-3')
  })
})

describe('SqliteJobScheduler', () => {
  const at = (iso: string) => new Date(iso)

  it('hands out due jobs oldest first, once, and keeps future ones', async () => {
    const jobs = new SqliteJobScheduler(db)
    await jobs.schedule({ id: 'b', runAt: at('2026-01-01T00:00:02Z'), payload: 'B' })
    await jobs.schedule({ id: 'a', runAt: at('2026-01-01T00:00:01Z'), payload: 'A' })
    await jobs.schedule({ id: 'later', runAt: at('2026-01-02T00:00:00Z'), payload: 'L' })
    const due = await jobs.claimDue(at('2026-01-01T12:00:00Z'), 10)
    expect(due.map((j) => j.id)).toEqual(['a', 'b'])
    expect(await jobs.claimDue(at('2026-01-01T12:00:00Z'), 10)).toEqual([])
    expect(await jobs.has('later')).toBe(true)
    expect(await jobs.has('a')).toBe(false)
  })

  it('replaces a job with the same id and respects the batch limit', async () => {
    const jobs = new SqliteJobScheduler(db)
    await jobs.schedule({ id: 'x', runAt: at('2026-01-01T00:00:00Z'), payload: 'old' })
    await jobs.schedule({ id: 'x', runAt: at('2026-01-01T00:00:00Z'), payload: 'new' })
    await jobs.schedule({ id: 'y', runAt: at('2026-01-01T00:00:00Z'), payload: 'y' })
    const first = await jobs.claimDue(at('2026-02-01T00:00:00Z'), 1)
    expect(first).toHaveLength(1)
    const rest = await jobs.claimDue(at('2026-02-01T00:00:00Z'), 10)
    expect([...first, ...rest].find((j) => j.id === 'x')?.payload).toBe('new')
  })

  it('cancels by prefix literally, so % and _ are not wildcards', async () => {
    const jobs = new SqliteJobScheduler(db)
    for (const id of ['planet:a.b:1', 'planet:a.b:2', 'planet:axb:1', 'planet:a_b:1'])
      await jobs.schedule({ id, runAt: at('2026-01-01T00:00:00Z'), payload: '' })
    await jobs.cancelWithPrefix('planet:a.b:')
    expect(await jobs.has('planet:a.b:1')).toBe(false)
    expect(await jobs.has('planet:axb:1')).toBe(true)
    await jobs.cancelWithPrefix('planet:a_')
    expect(await jobs.has('planet:a_b:1')).toBe(false)
    expect(await jobs.has('planet:axb:1')).toBe(true)
  })
})

describe('SqlitePlanetStateStore', () => {
  it('round-trips state and finds a webhook only by its token hash', async () => {
    const store = new SqlitePlanetStateStore(db)
    const updatedAt = new Date('2026-01-01T00:00:00Z')
    await store.save('p', 'w1', {
      data: { a: [1, { b: null }] },
      updatedAt,
      failures: 2,
      lastError: 'x',
    })
    expect(await store.get('p', 'w1')).toEqual({
      data: { a: [1, { b: null }] },
      updatedAt,
      failures: 2,
      lastError: 'x',
    })
    expect(await store.get('p', 'w2')).toBeUndefined()

    const target = { planetId: 'p', placementId: 'w1', sourceId: 's' }
    await store.saveWebhookToken(target, 'hash-1', updatedAt)
    expect(await store.findWebhook('hash-1')).toEqual(target)
    await store.saveWebhookToken(target, 'hash-2', updatedAt)
    expect(await store.findWebhook('hash-1')).toBeUndefined()
    expect(await store.findWebhook('hash-2')).toEqual(target)
  })

  it('deletes state and webhooks of one Planet only', async () => {
    const store = new SqlitePlanetStateStore(db)
    const now = new Date()
    const state = { data: {}, updatedAt: now, failures: 0, lastError: undefined }
    await store.save('p', 'w', state)
    await store.save('q', 'w', state)
    await store.saveWebhookToken({ planetId: 'p', placementId: 'w', sourceId: 's' }, 'h-p', now)
    await store.saveWebhookToken({ planetId: 'q', placementId: 'w', sourceId: 's' }, 'h-q', now)
    await store.deleteForPlanet('p')
    expect(await store.get('p', 'w')).toBeUndefined()
    expect(await store.findWebhook('h-p')).toBeUndefined()
    expect(await store.get('q', 'w')).toBeDefined()
    expect(await store.findWebhook('h-q')).toBeDefined()
  })
})
