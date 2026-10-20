import { describe, expect, it } from 'vitest'
import {
  formatMoney,
  formatPercent,
  formatShare,
  formatThousands,
  localeOf,
  moneyParts,
} from './format.ts'

describe('formatMoney', () => {
  it('formats in the given currency and locale', () => {
    expect(formatMoney(1842.56, 'USD', 'en-US')).toBe('$1,842.56')
    expect(formatMoney(-59.99, 'USD', 'en-US')).toBe('-$59.99')
    expect(formatMoney(1842.56, 'DKK', 'da-DK')).toMatch(/1\.842,56/)
  })
})

describe('moneyParts', () => {
  it('marks the decimal separator and cents as minor, and nothing else', () => {
    const parts = moneyParts(1842.56, 'USD', 'en-US')
    expect(parts.filter((p) => p.minor).map((p) => p.value)).toEqual(['.', '56'])
    expect(parts.map((p) => p.value).join('')).toBe('$1,842.56')
  })

  it('works when the symbol comes last, as in Danish', () => {
    const parts = moneyParts(1842.56, 'DKK', 'da-DK')
    expect(parts.filter((p) => p.minor).map((p) => p.value)).toEqual([',', '56'])
  })
})

describe('formatPercent', () => {
  it('drops the sign, because the direction is drawn as an arrow', () => {
    expect(formatPercent(2.46, 'en-US')).toBe('2.46%')
    expect(formatPercent(-1.84, 'en-US')).toBe('1.84%')
    expect(formatPercent(0, 'en-US')).toBe('0.00%')
  })
})

describe('formatShare', () => {
  it('shows one decimal', () => {
    expect(formatShare(32.8, 'en-US')).toBe('32.8%')
    expect(formatShare(6.74, 'en-US')).toBe('6.7%')
  })
})

describe('formatThousands', () => {
  it('writes axis ticks compactly', () => {
    expect(formatThousands(500)).toBe('0.5k')
    expect(formatThousands(2000)).toBe('2.0k')
  })
})

describe('localeOf', () => {
  it('uses a locale setting only when it is text', () => {
    expect(localeOf({ locale: 'da-DK' })).toBe('da-DK')
    expect(localeOf({ locale: 5 })).toBeUndefined()
    expect(localeOf({})).toBeUndefined()
  })
})
