import { createHash, randomBytes } from 'node:crypto'
import { hash, verify } from '@node-rs/argon2'
import type { PasswordHasher, SessionTokens } from '@orbit/application'

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
