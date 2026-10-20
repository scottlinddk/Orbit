import { describe, expect, it } from 'vitest'
import { readability } from './editor/readability.ts'
import {
  PRESETS,
  DEFAULT_DARK_PRESET,
  DEFAULT_PRESET,
  findPreset,
  sameTheme,
  systemTheme,
} from './presets.ts'
import { themeSchema } from './schema.ts'

describe('presets', () => {
  it('have unique ids and names', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length)
    expect(new Set(PRESETS.map((p) => p.theme.name)).size).toBe(PRESETS.length)
  })

  it.each(PRESETS.map((p) => [p.id, p.theme] as const))('%s is a valid theme', (_id, theme) => {
    expect(themeSchema.safeParse(theme).success).toBe(true)
  })

  // Presets are what people start from, so none of them may ship hard-to-read colors.
  it.each(PRESETS.map((p) => [p.id, p.theme] as const))(
    '%s meets its WCAG contrast targets',
    (_id, theme) => {
      const failing = readability(theme).filter((c) => !c.pass)
      expect(failing.map((c) => `${c.label}: ${c.ratio.toFixed(2)} (needs ${c.needs})`)).toEqual([])
    },
  )

  it('dark presets are dark and light ones are light', () => {
    for (const { theme } of PRESETS) {
      const dark = parseInt(theme.colors.background.slice(1), 16) < 0x808080
      expect(dark, theme.name).toBe(theme.scheme === 'dark')
    }
  })

  it('offers Ember by default, in the scheme the device prefers', () => {
    expect(systemTheme(false)).toBe(findPreset(DEFAULT_PRESET)!.theme)
    expect(systemTheme(true)).toBe(findPreset(DEFAULT_DARK_PRESET)!.theme)
    expect(systemTheme(false).scheme).toBe('light')
    expect(systemTheme(true).scheme).toBe('dark')
  })

  it('compares themes by value', () => {
    const ember = findPreset('ember')!.theme
    expect(sameTheme(ember, structuredClone(ember))).toBe(true)
    expect(sameTheme(ember, { ...ember, density: 'compact' })).toBe(false)
  })
})
