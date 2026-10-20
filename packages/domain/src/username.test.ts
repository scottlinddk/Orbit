import { describe, expect, it } from 'vitest'
import { InvariantViolation, Username } from './index.ts'

describe('Username', () => {
  it('normalizes case and surrounding whitespace', () => {
    expect(Username('  Alice.B_1 ')).toBe('alice.b_1')
  })

  it.each(['', 'ab', 'a'.repeat(33), '.alice', 'ali ce', 'ali/ce', 'alice@home', 'æble', "a'; --"])(
    'rejects %j',
    (bad) => {
      expect(() => Username(bad)).toThrow(InvariantViolation)
    },
  )
})
