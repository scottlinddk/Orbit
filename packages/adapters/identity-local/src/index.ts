import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { hash, verify } from '@node-rs/argon2'
import type { PasswordHasher, SessionTokens, SetupGate } from '@orbit/application'

/**
 * Argon2id with the OWASP minimum profile (19 MiB, 2 iterations, 1 lane). The salt is random
 * per hash and the parameters are stored inside the encoded hash, so they can be raised later
 * without breaking existing accounts. Argon2id is the library default algorithm.
 */
export class Argon2PasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 })
  }

  async verify(encodedHash: string, password: string): Promise<boolean> {
    try {
      return await verify(encodedHash, password)
    } catch {
      // A malformed stored hash must read as "wrong password", never as a server error
      // that would tell an attacker the account exists.
      return false
    }
  }
}

/**
 * 256-bit random tokens. Only the SHA-256 of a token is stored, so a leaked database cannot
 * be used to log in. A fast hash is correct here: the input already has 256 bits of entropy.
 */
export class RandomSessionTokens implements SessionTokens {
  generate() {
    const token = randomBytes(32).toString('base64url')
    return { token, tokenHash: this.hash(token) }
  }

  hash(token: string) {
    return createHash('sha256').update(token).digest('hex')
  }
}

/** No 0/O/1/I/L, so a code read from a log and typed by hand survives. 31 symbols. */
const SETUP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const SETUP_CODE_LENGTH = 12

/** Case, dashes and spaces do not matter when typing a code. */
const normalizeSetupCode = (code: string) => code.replace(/[\s-]/g, '').toUpperCase()
const digest = (code: string) => createHash('sha256').update(normalizeSetupCode(code)).digest()

/**
 * The one-time code that protects the first registration (see the SetupGate port). Only a
 * SHA-256 digest is kept in memory, so the code cannot be read back from the object. A fast
 * hash is fine: the 12 random symbols carry about 59 bits, and registration is rate limited.
 */
export class OneTimeSetupGate implements SetupGate {
  #digest: Buffer | undefined

  private constructor(code: string) {
    this.#digest = digest(code)
  }

  /** A fresh random code. Returns the gate and the code to show the operator once. */
  static generate(): { gate: OneTimeSetupGate; code: string } {
    let raw = ''
    for (let i = 0; i < SETUP_CODE_LENGTH; i++)
      raw += SETUP_ALPHABET[randomInt(SETUP_ALPHABET.length)]
    const code = raw.match(/.{4}/g)!.join('-')
    return { gate: new OneTimeSetupGate(code), code }
  }

  /** A code the operator chose (ORBIT_SETUP_CODE). */
  static fromCode(code: string): OneTimeSetupGate {
    return new OneTimeSetupGate(code)
  }

  isOpen(): boolean {
    return this.#digest !== undefined
  }

  accepts(code: string | undefined): boolean {
    if (this.#digest === undefined || code === undefined) return false
    return timingSafeEqual(this.#digest, digest(code))
  }

  close(): void {
    this.#digest = undefined
  }
}
