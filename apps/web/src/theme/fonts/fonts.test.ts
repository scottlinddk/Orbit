// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FONT_CATALOG } from './catalog.ts'
import type * as Loader from './loader.ts'
import type * as Stacks from './stacks.ts'
import { SYSTEM_FONTS, findFont, fontStack, isKnownFont } from './stacks.ts'

describe('font catalog', () => {
  it('has unique ids, and a family name that matches Fontsource’s naming', () => {
    expect(new Set(FONT_CATALOG.map((f) => f.id)).size).toBe(FONT_CATALOG.length)
    for (const font of FONT_CATALOG) {
      expect(font.family, font.id).toBe(`${font.label} Variable`)
      expect(font.weight, font.id).toMatch(/^\d{3,4} \d{3,4}$/)
      expect(font.ranges.latin, font.id).toMatch(/^U\+/)
    }
  })

  it('covers sans, serif and mono', () => {
    const categories = new Set(FONT_CATALOG.map((f) => f.category))
    expect([...categories].sort()).toEqual(['mono', 'sans', 'serif'])
  })

  it('does not share ids with the system fonts', () => {
    for (const system of SYSTEM_FONTS) expect(findFont(system.id)).toBeUndefined()
  })
})

describe('fontStack', () => {
  it('puts the family first and a category fallback after it', () => {
    expect(fontStack('inter')).toMatch(/^'Inter Variable', system-ui/)
    expect(fontStack('lora')).toMatch(/^'Lora Variable', ui-serif/)
    expect(fontStack('jetbrains-mono')).toMatch(/^'JetBrains Mono Variable', ui-monospace/)
  })

  it('gives system fonts no family of their own', () => {
    expect(fontStack('system-sans')).toMatch(/^system-ui/)
    expect(fontStack('system-serif')).toMatch(/^ui-serif/)
    expect(fontStack('system-mono')).toMatch(/^ui-monospace/)
  })

  it('never echoes unknown text into a stack', () => {
    expect(fontStack("x'; } body { display:none")).not.toContain('display')
    expect(fontStack('nonexistent')).toMatch(/^system-ui/)
  })
})

describe('isKnownFont', () => {
  it('knows catalog and system fonts only', () => {
    expect(isKnownFont('inter')).toBe(true)
    expect(isKnownFont('system-sans')).toBe(true)
    expect(isKnownFont('Inter')).toBe(false)
    expect(isKnownFont('')).toBe(false)
  })
})

describe('ensureFont', () => {
  const added: unknown[] = []
  let loadFace: () => Promise<void>
  let ensureFont: typeof Loader.ensureFont
  const faces: { family: string; source: string; descriptors: FontFaceDescriptors }[] = []

  beforeEach(async () => {
    vi.resetModules()
    added.length = 0
    faces.length = 0
    loadFace = () => Promise.resolve()
    vi.stubGlobal(
      'FontFace',
      class {
        family: string
        source: string
        descriptors: FontFaceDescriptors
        constructor(family: string, source: string, descriptors: FontFaceDescriptors) {
          this.family = family
          this.source = source
          this.descriptors = descriptors
          faces.push({ family, source, descriptors })
        }
        load() {
          return loadFace()
        }
      },
    )
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { add: (face: unknown) => added.push(face) },
    })
    // The real catalog loads files through Vite. Here it is replaced by two fixed URLs.
    vi.doMock('./stacks.ts', async (original) => {
      const actual = await original<typeof Stacks>()
      return {
        ...actual,
        findFont: (id: string) =>
          id === 'inter'
            ? {
                ...actual.findFont('inter')!,
                files: () => Promise.resolve({ latin: '/a/latin.woff2', latinExt: '/a/ext.woff2' }),
              }
            : undefined,
      }
    })
    ;({ ensureFont } = await import('./loader.ts'))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.doUnmock('./stacks.ts')
  })

  it('registers the latin and latin-ext files with their unicode ranges', async () => {
    await ensureFont('inter')
    expect(added).toHaveLength(2)
    expect(faces.map((f) => f.family)).toEqual(['Inter Variable', 'Inter Variable'])
    expect(faces[0]!.source).toContain('/a/latin.woff2')
    expect(faces[1]!.source).toContain('/a/ext.woff2')
    expect(faces[0]!.descriptors.unicodeRange).toMatch(/^U\+0000/)
    expect(faces[0]!.descriptors.display).toBe('swap')
  })

  it('loads a font once, however often it is asked for', async () => {
    await Promise.all([ensureFont('inter'), ensureFont('inter')])
    await ensureFont('inter')
    expect(added).toHaveLength(2)
  })

  it('ignores unknown ids and system fonts', async () => {
    await ensureFont('system-sans')
    await ensureFont('nope')
    expect(added).toHaveLength(0)
  })

  it('never rejects, and allows a retry after a failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    loadFace = () => Promise.reject(new Error('offline'))
    await expect(ensureFont('inter')).resolves.toBeUndefined()
    expect(added).toHaveLength(0)
    loadFace = () => Promise.resolve()
    await ensureFont('inter')
    expect(added).toHaveLength(2)
    warn.mockRestore()
  })

  it('does nothing in a browser without the FontFace API', async () => {
    vi.stubGlobal('FontFace', undefined)
    await expect(ensureFont('inter')).resolves.toBeUndefined()
    expect(added).toHaveLength(0)
  })
})
