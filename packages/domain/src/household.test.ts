import { describe, expect, it } from 'vitest'
import {
  HouseholdId,
  InvariantViolation,
  UserId,
  addMember,
  createHousehold,
  removeMember,
  roleOf,
} from './index.ts'

const alice = UserId('alice')
const bob = UserId('bob')
const base = () => createHousehold({ id: HouseholdId('h1'), name: ' Home ', ownerId: alice })

describe('household', () => {
  it('starts with its creator as the only owner and trims the name', () => {
    const h = base()
    expect(h.name).toBe('Home')
    expect(h.members).toEqual([{ userId: alice, role: 'owner' }])
  })

  it('rejects empty and overlong names', () => {
    const make = (name: string) => () =>
      createHousehold({ id: HouseholdId('h'), name, ownerId: alice })
    expect(make('   ')).toThrow(InvariantViolation)
    expect(make('x'.repeat(81))).toThrow(InvariantViolation)
  })

  it('adds members as plain members by default and rejects duplicates', () => {
    const h = addMember(base(), bob)
    expect(roleOf(h, bob)).toBe('member')
    expect(() => addMember(h, bob)).toThrow(InvariantViolation)
  })

  it('removes members but never the last owner', () => {
    const h = addMember(base(), bob)
    expect(roleOf(removeMember(h, bob), bob)).toBeUndefined()
    expect(() => removeMember(h, alice)).toThrow('at least one owner')
  })

  it('allows removing an owner when another owner remains', () => {
    const h = addMember(base(), bob, 'owner')
    expect(roleOf(removeMember(h, alice), alice)).toBeUndefined()
  })

  it('rejects removing someone who is not a member', () => {
    expect(() => removeMember(base(), bob)).toThrow(InvariantViolation)
  })

  it('does not mutate the original household', () => {
    const h = base()
    addMember(h, bob)
    expect(h.members).toHaveLength(1)
  })
})
