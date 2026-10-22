import { describe, expect, it } from 'vitest'
import {
  REFRESH_DEFAULT_SECONDS,
  REFRESH_MAX_SECONDS,
  REFRESH_MIN_SECONDS,
  SCALE_MAX,
  SCALE_MIN,
  parseRefreshSeconds,
  parseScale,
} from './settings.ts'

describe('parseRefreshSeconds', () => {
  it('uses the default when absent or unusable', () => {
    for (const raw of [null, '', '  ', 'abc', 'NaN', 'Infinity']) {
      expect(parseRefreshSeconds(raw), String(raw)).toBe(REFRESH_DEFAULT_SECONDS)
    }
  })

  it('accepts a number of seconds and rounds it', () => {
    expect(parseRefreshSeconds('120')).toBe(120)
    expect(parseRefreshSeconds('30.4')).toBe(30)
  })

  it('stays within the bounds, so a typo cannot hammer the server or freeze the wall', () => {
    expect(parseRefreshSeconds('1')).toBe(REFRESH_MIN_SECONDS)
    expect(parseRefreshSeconds('-5')).toBe(REFRESH_MIN_SECONDS)
    expect(parseRefreshSeconds('999999')).toBe(REFRESH_MAX_SECONDS)
  })
})

describe('parseScale', () => {
  it('is null when absent or unusable, so the saved value can apply', () => {
    for (const raw of [null, '', 'big', 'Infinity']) expect(parseScale(raw), String(raw)).toBeNull()
  })

  it('accepts a factor and bounds it', () => {
    expect(parseScale('1.5')).toBe(1.5)
    expect(parseScale('0.1')).toBe(SCALE_MIN)
    expect(parseScale('50')).toBe(SCALE_MAX)
  })
})
