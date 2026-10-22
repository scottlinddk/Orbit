import { describe, expect, it } from 'vitest'
import { InvariantViolation } from './errors.ts'
import {
  createConnection,
  externalId,
  parseExternalId,
  withMirrors,
  MAX_MIRRORS_PER_CONNECTION,
} from './connection.ts'
import { ConnectionId, HouseholdId, UserId } from './ids.ts'

const base = () =>
  createConnection({
    id: ConnectionId('c1'),
    householdId: HouseholdId('h1'),
    kind: 'homeassistant',
    name: '  Home Assistant ',
    host: 'ha.local:8123',
    createdBy: UserId('u1'),
    now: new Date('2026-01-01T00:00:00Z'),
  })

describe('connection', () => {
  it('trims the name and starts without mirrors', () => {
    expect(base()).toMatchObject({ name: 'Home Assistant', mirrors: [] })
  })

  it('refuses an empty name or an unknown kind', () => {
    const now = new Date()
    expect(() => createConnection({ ...base(), name: ' ', now })).toThrow(InvariantViolation)
    expect(() => createConnection({ ...base(), kind: 'nope' as never, now })).toThrow(
      InvariantViolation,
    )
  })

  it('accepts valid mirrors and refuses bad entity ids, duplicates and too many', () => {
    const ok = withMirrors(base(), [
      { entityId: 'calendar.family', role: 'calendar', name: 'Family' },
      { entityId: 'todo.shopping_list', role: 'todo', name: 'Shopping' },
    ])
    expect(ok.mirrors).toHaveLength(2)
    expect(() =>
      withMirrors(base(), [{ entityId: '../etc', role: 'calendar', name: 'x' }]),
    ).toThrow(InvariantViolation)
    expect(() =>
      withMirrors(base(), [
        { entityId: 'todo.a', role: 'todo', name: 'A' },
        { entityId: 'todo.a', role: 'todo', name: 'A' },
      ]),
    ).toThrow(/twice/)
    const many = Array.from({ length: MAX_MIRRORS_PER_CONNECTION + 1 }, (_, i) => ({
      entityId: `todo.l${i}`,
      role: 'todo' as const,
      name: `L${i}`,
    }))
    expect(() => withMirrors(base(), many)).toThrow(InvariantViolation)
  })

  it('builds and parses external ids', () => {
    const id = externalId(ConnectionId('c1'), 'todo.shopping')
    expect(id).toBe('c1:todo.shopping')
    expect(parseExternalId(id)).toEqual({ connectionId: 'c1', entityId: 'todo.shopping' })
    expect(parseExternalId('plain-id')).toBeUndefined()
    expect(parseExternalId('c1:')).toBeUndefined()
  })
})
