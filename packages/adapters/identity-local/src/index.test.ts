import { describe, expect, it } from 'vitest'
import { Argon2PasswordHasher, OneTimeSetupGate, RandomSessionTokens } from './index.ts'

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher()

  it('produces an argon2id hash that verifies only the right password', async () => {
    const encoded = await hasher.hash('correct horse battery')
    expect(encoded).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
    expect(await hasher.verify(encoded, 'correct horse battery')).toBe(true)
    expect(await hasher.verify(encoded, 'correct horse batterz')).toBe(false)
    expect(encoded).not.toContain('correct horse battery')
  })

  it('salts every hash', async () => {
    expect(await hasher.hash('same password!!')).not.toBe(await hasher.hash('same password!!'))
  })

  it('treats a malformed stored hash as a failed login', async () => {
    expect(await hasher.verify('not-a-hash', 'whatever')).toBe(false)
    expect(await hasher.verify('', 'whatever')).toBe(false)
  })

  it('handles unicode passwords', async () => {
    const encoded = await hasher.hash('Køb brød og æbler 🍎')
    expect(await hasher.verify(encoded, 'Køb brød og æbler 🍎')).toBe(true)
  })
})

describe('RandomSessionTokens', () => {
  const tokens = new RandomSessionTokens()

  it('generates unique 256-bit url-safe tokens', () => {
    const seen = new Set(Array.from({ length: 200 }, () => tokens.generate().token))
    expect(seen.size).toBe(200)
    for (const t of seen) expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('hashes deterministically and never returns the token itself', () => {
    const { token, tokenHash } = tokens.generate()
    expect(tokens.hash(token)).toBe(tokenHash)
    expect(tokenHash).not.toContain(token)
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('OneTimeSetupGate', () => {
  it('generates a readable code that opens the gate once', () => {
    const { gate, code } = OneTimeSetupGate.generate()
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/)
    expect(gate.isOpen()).toBe(true)
    expect(gate.accepts(code)).toBe(true)
    expect(gate.accepts(undefined)).toBe(false)
    expect(gate.accepts('AAAA-AAAA-AAAA')).toBe(false)
  })

  it('ignores case, dashes and spaces when typing', () => {
    const { gate, code } = OneTimeSetupGate.generate()
    expect(gate.accepts(code.toLowerCase().replaceAll('-', ' '))).toBe(true)
    expect(gate.accepts(code.replaceAll('-', ''))).toBe(true)
  })

  it('does not repeat codes', () => {
    const codes = new Set(Array.from({ length: 50 }, () => OneTimeSetupGate.generate().code))
    expect(codes.size).toBe(50)
  })

  it('accepts a code the operator chose', () => {
    const gate = OneTimeSetupGate.fromCode('my-own-long-code')
    expect(gate.accepts('MYOWNLONGCODE')).toBe(true)
    expect(gate.accepts('my-own-long-cod')).toBe(false)
  })

  it('accepts nothing after it is closed', () => {
    const { gate, code } = OneTimeSetupGate.generate()
    gate.close()
    expect(gate.isOpen()).toBe(false)
    expect(gate.accepts(code)).toBe(false)
  })
})
