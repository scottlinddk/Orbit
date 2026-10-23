import { describe, expect, it } from 'vitest'
import { InvariantViolation } from './errors.ts'
import { createExternalIdentity } from './external-identity.ts'
import { UserId } from './ids.ts'

const base = {
  issuer: 'https://id.example.com',
  subject: 'abc',
  userId: UserId('u1'),
  now: new Date('2026-01-01T00:00:00Z'),
}

describe('createExternalIdentity', () => {
  it('keeps the issuer and subject exactly as given', () => {
    const identity = createExternalIdentity(base)
    expect(identity.issuer).toBe('https://id.example.com')
    expect(identity.subject).toBe('abc')
  })

  it('rejects an empty or oversized subject and issuer', () => {
    expect(() => createExternalIdentity({ ...base, subject: '' })).toThrow(InvariantViolation)
    expect(() => createExternalIdentity({ ...base, subject: 'x'.repeat(256) })).toThrow(
      InvariantViolation,
    )
    expect(() => createExternalIdentity({ ...base, issuer: '' })).toThrow(InvariantViolation)
  })
})
