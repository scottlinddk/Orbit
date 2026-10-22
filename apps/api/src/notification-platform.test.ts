import { InvariantViolation } from '@orbit/domain'
import { describe, expect, it } from 'vitest'
import { createNodeNotificationPlatform } from './notification-platform.ts'

const platform = createNodeNotificationPlatform()

/** Computed independently with Python's hmac module, not with this code. */
const BODY =
  '{"version":1,"id":"d1","event":"notification.test","occurredAt":"2026-01-01T00:00:00.000Z","data":{"message":"hi"}}'

describe('webhook signature', () => {
  it('matches a known HMAC-SHA256 vector over "<timestamp>.<body>"', () => {
    expect(platform.sign('whsec_test', 1767225600, BODY)).toBe(
      '97e2748109c856cbd141554be54c764ddaf1804df3c0d16fa910e37fa64532e7',
    )
  })

  it('changes when the timestamp changes, so an old delivery cannot be replayed as a new one', () => {
    const later = platform.sign('whsec_test', 1767225601, BODY)
    expect(later).toBe('e558d90fd8521950af21829c3aeb8a83e8c64829737a4dc0fbfba4b3a7314233')
    expect(later).not.toBe(platform.sign('whsec_test', 1767225600, BODY))
  })

  it('changes when the body or the secret changes', () => {
    const base = platform.sign('whsec_test', 1767225600, BODY)
    expect(platform.sign('whsec_test', 1767225600, `${BODY} `)).not.toBe(base)
    expect(platform.sign('whsec_other', 1767225600, BODY)).not.toBe(base)
  })
})

describe('signing secrets', () => {
  it('are 256 random bits as hex and never repeat', () => {
    const a = platform.newSecret()
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(platform.newSecret()).not.toBe(a)
  })
})

describe('webhook addresses', () => {
  it('accepts http and https and returns the host', () => {
    expect(platform.parseAddress(' https://hooks.example.com/a/b?token=x ')).toEqual({
      url: 'https://hooks.example.com/a/b?token=x',
      host: 'hooks.example.com',
    })
    expect(platform.parseAddress('http://homeassistant.local:8123/api/webhook/x').host).toBe(
      'homeassistant.local',
    )
  })

  it.each([
    ['', 'must be 1 to'],
    ['not a url', 'web address'],
    ['ftp://example.com/x', 'http:// or https://'],
    ['file:///etc/passwd', 'http:// or https://'],
    ['javascript:alert(1)', 'http:// or https://'],
    ['https://user:secret@example.com/x', 'password'],
    ['https://example.com/' + 'a'.repeat(2000), 'must be 1 to'],
  ])('refuses %j', (input, message) => {
    expect(() => platform.parseAddress(input)).toThrow(InvariantViolation)
    expect(() => platform.parseAddress(input)).toThrow(message)
  })

  it('counts bytes, not characters', () => {
    expect(platform.byteLength('åäö')).toBe(6)
  })
})
