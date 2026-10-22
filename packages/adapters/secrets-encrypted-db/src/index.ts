import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { SecretStore } from '@orbit/application'

const MIN_KEY_LENGTH = 32
const ALGORITHM = 'aes-256-gcm'
const VERSION = 'v1'

export class SecretKeyError extends Error {
  override readonly name = 'SecretKeyError'
}

/**
 * Stores credentials in the `secrets` table, encrypted with AES-256-GCM under a key derived
 * from the master key the operator supplies. The scope and name are authenticated with the
 * ciphertext, so a value copied to another row does not decrypt. The master key is not in the
 * database, so a leaked backup alone reveals no secret.
 */
export class EncryptedDbSecretStore implements SecretStore {
  readonly #db: DatabaseSync
  readonly #key: Buffer

  constructor(db: DatabaseSync, masterKey: string) {
    if (masterKey.length < MIN_KEY_LENGTH) {
      throw new SecretKeyError(
        `The secret key must be at least ${MIN_KEY_LENGTH} characters. Generate one with: openssl rand -base64 32`,
      )
    }
    this.#db = db
    this.#key = Buffer.from(
      hkdfSync('sha256', masterKey, 'orbit-secret-store', 'aes-256-gcm key', 32),
    )
  }

  async set(scope: string, name: string, value: string): Promise<void> {
    this.#db
      .prepare(
        `INSERT INTO secrets (scope, name, ciphertext, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (scope, name) DO UPDATE SET ciphertext = excluded.ciphertext, updated_at = excluded.updated_at`,
      )
      .run(scope, name, this.#encrypt(scope, name, value), new Date().toISOString())
  }

  async get(scope: string, name: string): Promise<string | undefined> {
    const row = this.#db
      .prepare('SELECT ciphertext FROM secrets WHERE scope = ? AND name = ?')
      .get(scope, name) as { ciphertext: string } | undefined
    return row ? this.#decrypt(scope, name, row.ciphertext) : undefined
  }

  async names(scope: string): Promise<string[]> {
    const rows = this.#db
      .prepare('SELECT name FROM secrets WHERE scope = ? ORDER BY name')
      .all(scope) as { name: string }[]
    return rows.map((row) => row.name)
  }

  async deleteScope(scope: string): Promise<void> {
    this.#db.prepare('DELETE FROM secrets WHERE scope = ?').run(scope)
  }

  #encrypt(scope: string, name: string, value: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv(ALGORITHM, this.#key, iv)
    cipher.setAAD(Buffer.from(`${scope}\0${name}`))
    const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    return [VERSION, iv, cipher.getAuthTag(), body]
      .map((p) => (typeof p === 'string' ? p : p.toString('base64')))
      .join(':')
  }

  #decrypt(scope: string, name: string, stored: string): string {
    const [version, iv, tag, body] = stored.split(':')
    if (version !== VERSION || !iv || !tag || body === undefined) {
      throw new SecretKeyError('A stored secret has an unknown format.')
    }
    try {
      const decipher = createDecipheriv(ALGORITHM, this.#key, Buffer.from(iv, 'base64'))
      decipher.setAAD(Buffer.from(`${scope}\0${name}`))
      decipher.setAuthTag(Buffer.from(tag, 'base64'))
      return Buffer.concat([
        decipher.update(Buffer.from(body, 'base64')),
        decipher.final(),
      ]).toString('utf8')
    } catch {
      throw new SecretKeyError(
        'A stored secret could not be decrypted. Is ORBIT_SECRET_KEY the key it was saved with?',
      )
    }
  }
}
