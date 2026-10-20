// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import css from '../styles/tokens.css?raw'
import { findPreset } from './presets.ts'
import type { Theme } from './schema.ts'
import { applyTheme, themeToCssVars } from './tokens.ts'

const ember = findPreset('ember')!.theme
const withShape = (shape: Partial<Theme['shape']>): Theme => ({
  ...ember,
  shape: { ...ember.shape, ...shape },
})

describe('themeToCssVars', () => {
  it('maps colors, fonts and shape to the variables components read', () => {
    const vars = themeToCssVars(ember)
    expect(vars['--color-bg']).toBe(ember.colors.background)
    expect(vars['--color-surface-2']).toBe(ember.colors.surfaceRaised)
    expect(vars['--color-hero-text']).toBe(ember.colors.heroText)
    expect(vars['--radius']).toBe('28px')
    expect(vars['--border-width']).toBe('0px')
    expect(vars['--border-style']).toBe('solid')
    expect(vars['--font-heading']).toBe(
      "'Inter Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    )
  })

  it('draws a three-stop gradient, or the middle color alone when solid', () => {
    expect(themeToCssVars(ember)['--hero-bg']).toBe(
      `linear-gradient(180deg, ${ember.colors.heroFrom} 0%, ${ember.colors.heroVia} 58%, ${ember.colors.heroTo} 100%)`,
    )
    expect(themeToCssVars({ ...ember, heroStyle: 'solid' })['--hero-bg']).toBe(ember.colors.heroVia)
  })

  it('maps button shapes, shadows and density', () => {
    expect(themeToCssVars(withShape({ buttons: 'pill' }))['--radius-button']).toBe('999px')
    expect(themeToCssVars(withShape({ buttons: 'square' }))['--radius-button']).toBe('0')
    expect(themeToCssVars(withShape({ buttons: 'rounded' }))['--radius-button']).toBe(
      'var(--radius-sm)',
    )
    expect(themeToCssVars(withShape({ shadow: 'none' }))['--shadow']).toBe('none')
    expect(themeToCssVars(withShape({ shadow: 'strong' }))['--shadow']).toContain('rgb(')
    expect(themeToCssVars({ ...ember, density: 'compact' })['--density']).toBe('0.8')
    expect(themeToCssVars({ ...ember, density: 'spacious' })['--density']).toBe('1.25')
  })

  it('keeps the focus ring visible: accent if it contrasts with the page, else the text color', () => {
    expect(themeToCssVars(ember)['--color-focus']).toBe(ember.colors.accent)
    const lowContrast: Theme = { ...ember, colors: { ...ember.colors, accent: '#f5f1ef' } }
    expect(themeToCssVars(lowContrast)['--color-focus']).toBe(ember.colors.text)
  })

  it('only ever emits custom properties', () => {
    for (const name of Object.keys(themeToCssVars(ember))) expect(name).toMatch(/^--[a-z0-9-]+$/)
  })
})

describe('applyTheme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style')
    document.documentElement.removeAttribute('data-scheme')
  })

  it('sets every variable and the color scheme on the root element', () => {
    applyTheme(findPreset('graphite')!.theme)
    const root = document.documentElement
    expect(root.style.getPropertyValue('--color-bg')).toBe('#0b0b0c')
    expect(root.style.getPropertyValue('--radius')).toBe('16px')
    expect(root.style.colorScheme).toBe('dark')
    expect(root.dataset.scheme).toBe('dark')
  })

  it('replaces the previous theme completely', () => {
    applyTheme(findPreset('graphite')!.theme)
    applyTheme(ember)
    expect(document.documentElement.style.getPropertyValue('--color-bg')).toBe('#f4f0ee')
    expect(document.documentElement.dataset.scheme).toBe('light')
  })
})

describe('tokens.css', () => {
  // tokens.css is the first paint and the fallback. If it drifted from the Ember preset, a
  // visitor would see one palette flash into another.
  it('has the same defaults as the Ember preset', () => {
    const declared = new Map(
      [...css.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)].map((m) => [
        m[1]!,
        m[2]!.replace(/\s+/g, ' ').trim(),
      ]),
    )
    const expected = themeToCssVars(ember)
    const compared: string[] = []
    for (const [name, value] of Object.entries(expected)) {
      const fallback = declared.get(name)
      // Values built from other variables (the gradient, the rounded button radius) are
      // computed in CSS, so only literal defaults are compared.
      if (fallback === undefined || fallback.includes('var(')) continue
      expect(fallback, name).toBe(value.replace(/\s+/g, ' '))
      compared.push(name)
    }
    // Guards the guard: the comparison must have covered the colors and shape.
    expect(compared).toEqual(
      expect.arrayContaining([
        '--color-bg',
        '--color-text',
        '--color-accent',
        '--radius',
        '--hero-from',
      ]),
    )
    // Every variable the theme sets has a fallback.
    expect([...Object.keys(expected)].filter((n) => !declared.has(n))).toEqual([])
  })
})
