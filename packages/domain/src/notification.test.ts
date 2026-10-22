import { describe, expect, it } from 'vitest'
import { HouseholdId, NotificationEndpointId, UserId } from './ids.ts'
import {
  AUTO_DISABLE_AFTER_FAILURES,
  DEFAULT_LEAD_MINUTES,
  createNotificationEndpoint,
  recordDeliveryResult,
  retryDelaySeconds,
  updateNotificationEndpoint,
} from './notification.ts'

const make = (over: { events?: string[]; leadMinutes?: number; name?: string } = {}) =>
  createNotificationEndpoint({
    id: NotificationEndpointId('e1'),
    householdId: HouseholdId('h1'),
    name: over.name ?? 'Chat',
    host: 'hooks.example.com',
    events: over.events ?? ['list.item.added'],
    leadMinutes: over.leadMinutes,
    createdBy: UserId('alice'),
    now: new Date('2026-01-01T00:00:00Z'),
  })

describe('notification endpoint', () => {
  it('starts on, with the default reminder time and no failures', () => {
    expect(make()).toMatchObject({ enabled: true, failures: 0, leadMinutes: DEFAULT_LEAD_MINUTES })
  })

  it('keeps events in a fixed order and without duplicates', () => {
    const e = make({
      events: ['list.item.completed', 'calendar.event.starting', 'list.item.completed'],
    })
    expect(e.events).toEqual(['calendar.event.starting', 'list.item.completed'])
  })

  it.each([
    [{ events: [] }, 'Choose at least one event'],
    [{ events: ['nope'] }, 'Unknown event'],
    [{ leadMinutes: 0 }, 'minutes before'],
    [{ leadMinutes: 1441 }, 'minutes before'],
    [{ leadMinutes: 1.5 }, 'minutes before'],
    [{ name: '  ' }, 'Name must be'],
  ])('refuses invalid input %j', (over, message) => {
    expect(() => make(over)).toThrow(message)
  })

  it('counts failures and switches off at the limit with a reason', () => {
    let e = make()
    for (let i = 1; i < AUTO_DISABLE_AFTER_FAILURES; i++) {
      e = recordDeliveryResult(e, { delivered: false, error: 'boom' })
      expect(e.enabled).toBe(true)
    }
    e = recordDeliveryResult(e, { delivered: false, error: 'boom' })
    expect(e.enabled).toBe(false)
    expect(e.disabledReason).toContain('boom')
  })

  it('resets the failure count when a delivery arrives', () => {
    let e = make()
    e = recordDeliveryResult(e, { delivered: false, error: 'x' })
    e = recordDeliveryResult(e, { delivered: false, error: 'x' })
    expect(recordDeliveryResult(e, { delivered: true }).failures).toBe(0)
  })

  it('clears failures and the reason when switched back on', () => {
    let e = make()
    for (let i = 0; i < AUTO_DISABLE_AFTER_FAILURES; i++)
      e = recordDeliveryResult(e, { delivered: false, error: 'boom' })
    const back = updateNotificationEndpoint(e, { enabled: true })
    expect(back).toMatchObject({ enabled: true, failures: 0 })
    expect('disabledReason' in back).toBe(false)
  })

  it('gives a manually switched-off endpoint a reason, and edits keep the failure count', () => {
    const off = updateNotificationEndpoint(make(), { enabled: false })
    expect(off.disabledReason).toBe('Switched off by an owner')
    const failing = recordDeliveryResult(make(), { delivered: false, error: 'x' })
    expect(updateNotificationEndpoint(failing, { name: 'Renamed' })).toMatchObject({
      name: 'Renamed',
      failures: 1,
    })
  })
})

describe('retryDelaySeconds', () => {
  it('grows by four each time and is capped at an hour', () => {
    expect([1, 2, 3, 4].map(retryDelaySeconds)).toEqual([30, 120, 480, 1920])
    expect(retryDelaySeconds(10)).toBe(3600)
  })
})
