import { FONT_CATALOG } from './catalog.ts'
import type { FontCategory, FontEntry } from './types.ts'

/** Fonts that need no download: whatever the device already has. */
export const SYSTEM_FONTS = [
  { id: 'system-sans', label: 'System sans', category: 'sans' },
  { id: 'system-serif', label: 'System serif', category: 'serif' },
  { id: 'system-mono', label: 'System mono', category: 'mono' },
] as const satisfies readonly { id: string; label: string; category: FontCategory }[]

export type FontId = string

const FALLBACKS: Record<FontCategory, string> = {
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  serif: "ui-serif, Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
}

const byId = new Map<string, FontEntry>(FONT_CATALOG.map((font) => [font.id, font]))

export const findFont = (id: FontId): FontEntry | undefined => byId.get(id)

export const isKnownFont = (id: string): boolean =>
  byId.has(id) || SYSTEM_FONTS.some((font) => font.id === id)

/**
 * The CSS `font-family` value for a font id. It is built only from catalog data, never from
 * user text, so a saved or imported theme cannot inject CSS through it.
 */
export function fontStack(id: FontId): string {
  const font = byId.get(id)
  if (font) return `'${font.family}', ${FALLBACKS[font.category]}`
  const system = SYSTEM_FONTS.find((f) => f.id === id)
  return FALLBACKS[system?.category ?? 'sans']
}
