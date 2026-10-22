import { describe, expect, it } from 'vitest'
import { nextRefreshAt } from './schedule.ts'

const policy = {
  interval_seconds: 900,
  min_interval_seconds: 300,
  jitter_percent: 10,
  backoff_max_seconds: 3600,
}
const now = new Date('2026-01-01T00:00:00Z')
const seconds = (input: Partial<Parameters<typeof nextRefreshAt>[0]>) =>
  (nextRefreshAt({ policy, now, consecutiveFailures: 0, random: 0, ...input }).getTime() -
    now.getTime()) /
  1000

describe('nextRefreshAt', () => {
  it('waits the interval after a success', () => {
    expect(seconds({})).toBe(900)
  })

  it('never goes below min_interval_seconds, even if the interval asks for less', () => {
    expect(seconds({ policy: { ...policy, interval_seconds: 60 } })).toBe(300)
  })

  it('doubles the wait for every consecutive failure, up to the maximum', () => {
    expect([1, 2, 3, 4, 10].map((n) => seconds({ consecutiveFailures: n }))).toEqual([
      1800, 3600, 3600, 3600, 3600,
    ])
  })

  it('adds jitter of at most jitter_percent and never shortens the wait', () => {
    expect(seconds({ random: 0.5 })).toBe(945)
    expect(seconds({ random: 0.999999 })).toBeLessThanOrEqual(990)
    expect(seconds({ random: 0 })).toBe(900)
  })
})
