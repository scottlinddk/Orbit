import { describe, expect, it } from 'vitest'
import { findPreset } from './presets.ts'
import {
  STORAGE_KEY,
  clearTheme,
  loadTheme,
  parseTheme,
  saveTheme,
  serializeTheme,
} from './storage.ts'

const ember = findPreset('ember')!.theme

/** A minimal in-memory Storage. */
function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  }
}

const broken = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('quota')
  },
  removeItem: () => {
    throw new Error('blocked')
  },
}

describe('theme storage', () => {
  it('round-trips a theme', () => {
    const store = memory()
    expect(saveTheme(ember, store)).toBe(true)
    expect(loadTheme(store)).toEqual(ember)
    expect(store.data.has(STORAGE_KEY)).toBe(true)
  })

  it('returns null when nothing is saved, and clears what is', () => {
    const store = memory()
    expect(loadTheme(store)).toBeNull()
    saveTheme(ember, store)
    clearTheme(store)
    expect(loadTheme(store)).toBeNull()
  })

  it('survives storage that throws, as in a private window', () => {
    expect(loadTheme(broken)).toBeNull()
    expect(saveTheme(ember, broken)).toBe(false)
    expect(() => clearTheme(broken)).not.toThrow()
  })

  it('treats corrupt or tampered data as no theme instead of crashing', () => {
    for (const bad of ['', '{', 'null', '[]', '"x"', '{"name":"x"}']) {
      expect(loadTheme(memory({ [STORAGE_KEY]: bad }))).toBeNull()
    }
  })
})

describe('parseTheme', () => {
  const edit = (change: (t: any) => void) => {
    const copy = structuredClone(ember) as any
    change(copy)
    return JSON.stringify(copy)
  }

  it('accepts exactly what serializeTheme writes', () => {
    expect(parseTheme(serializeTheme(ember))).toEqual(ember)
  })

  it('rejects colors that are not plain #rrggbb, so nothing can be injected into a style', () => {
    for (const color of [
      'red',
      '#fff',
      'rgb(0,0,0)',
      '#12345g',
      'url(https://evil.example/x)',
      '#000000; background: url(x)',
      'var(--color-bg)',
    ]) {
      expect(parseTheme(edit((t) => (t.colors.text = color))), color).toBeNull()
    }
  })

  it('rejects font names that are not in the catalog', () => {
    expect(parseTheme(edit((t) => (t.fonts.body = 'Comic Sans MS')))).toBeNull()
    expect(parseTheme(edit((t) => (t.fonts.body = "x'; } body { display:none")))).toBeNull()
  })

  it('rejects out of range or non-whole shape values', () => {
    expect(parseTheme(edit((t) => (t.shape.radius = 41)))).toBeNull()
    expect(parseTheme(edit((t) => (t.shape.radius = -1)))).toBeNull()
    expect(parseTheme(edit((t) => (t.shape.radius = 1.5)))).toBeNull()
    expect(parseTheme(edit((t) => (t.shape.borderWidth = 5)))).toBeNull()
    expect(parseTheme(edit((t) => (t.shape.borderStyle = 'groove; color: red')))).toBeNull()
  })

  it('rejects unknown keys and missing ones', () => {
    expect(parseTheme(edit((t) => (t.extra = 1)))).toBeNull()
    expect(parseTheme(edit((t) => delete t.colors.accent))).toBeNull()
    expect(parseTheme(edit((t) => (t.name = '   ')))).toBeNull()
  })
})
