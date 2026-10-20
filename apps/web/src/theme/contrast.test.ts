import { describe, expect, it } from 'vitest'
import { contrastRatio, grade, luminance, readableOn } from './contrast.ts'

describe('contrast', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#ffffff', '#ffffff')).toBe(1)
    // The classic #777 on white sits just under the 4.5:1 line.
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2)
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  it('is symmetric', () => {
    expect(contrastRatio('#336699', '#ffeedd')).toBe(contrastRatio('#ffeedd', '#336699'))
  })

  it('has black at 0 luminance and white at 1', () => {
    expect(luminance('#000000')).toBe(0)
    expect(luminance('#ffffff')).toBeCloseTo(1, 10)
  })

  it('grades at the WCAG thresholds', () => {
    expect(grade(21)).toBe('AAA')
    expect(grade(7)).toBe('AAA')
    expect(grade(6.99)).toBe('AA')
    expect(grade(4.5)).toBe('AA')
    expect(grade(4.49)).toBe('large')
    expect(grade(3)).toBe('large')
    expect(grade(2.99)).toBe('fail')
  })

  it('picks the more readable of black and white', () => {
    expect(readableOn('#ffffff')).toBe('#000000')
    expect(readableOn('#000000')).toBe('#ffffff')
    expect(readableOn('#c2410c')).toBe('#ffffff')
    expect(readableOn('#f4a672')).toBe('#000000')
  })
})
