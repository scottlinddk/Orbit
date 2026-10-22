import { describe, expect, it } from 'vitest'
import { InvariantViolation } from './errors.ts'
import { CalendarSourceId, HouseholdId, UserId } from './ids.ts'
import { createCalendarSource } from './calendar-source.ts'

const base = {
  id: CalendarSourceId('s1'),
  householdId: HouseholdId('h1'),
  name: ' Family ',
  host: 'cal.example.com',
  createdBy: UserId('u1'),
  now: new Date('2026-01-01T00:00:00Z'),
}

describe('createCalendarSource', () => {
  it('trims the name, lowercases the color and keeps no address', () => {
    const source = createCalendarSource({ ...base, color: '#AABBCC' })
    expect(source).toMatchObject({ name: 'Family', color: '#aabbcc', host: 'cal.example.com' })
    expect(Object.keys(source)).not.toContain('url')
  })

  it.each([[''], ['   '], ['x'.repeat(81)]])('refuses the name %j', (name) => {
    expect(() => createCalendarSource({ ...base, name })).toThrow(InvariantViolation)
  })

  it.each([['red'], ['#fff'], ['#gggggg'], ['aabbcc']])('refuses the color %s', (color) => {
    expect(() => createCalendarSource({ ...base, color })).toThrow(InvariantViolation)
  })
})
