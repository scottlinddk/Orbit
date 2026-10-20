import { z } from 'zod'
import { isKnownFont } from './fonts/stacks.ts'

/** `#rrggbb`. Anything else, including CSS functions, is rejected, so a color is safe to put in a style. */
export const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, 'Use a color like #1a2b3c')

const fontId = z.string().refine(isKnownFont, 'Unknown font')

export const COLOR_KEYS = [
  'background',
  'surface',
  'surfaceRaised',
  'text',
  'textMuted',
  'border',
  'accent',
  'accentText',
  'heroFrom',
  'heroVia',
  'heroTo',
  'heroText',
  'danger',
  'success',
  'warning',
] as const
export type ColorKey = (typeof COLOR_KEYS)[number]

export const RADIUS_MAX = 40
export const BORDER_WIDTH_MAX = 4

export const BORDER_STYLES = ['solid', 'dashed', 'dotted', 'double'] as const
export const BUTTON_SHAPES = ['pill', 'rounded', 'square'] as const
export const SHADOWS = ['none', 'soft', 'strong'] as const
export const DENSITIES = ['compact', 'comfortable', 'spacious'] as const
export const HERO_STYLES = ['gradient', 'solid'] as const
export const SCHEMES = ['light', 'dark'] as const

export const themeSchema = z.strictObject({
  name: z.string().trim().min(1).max(40),
  /** Tells the browser which built-in controls (scrollbars, form fields) to draw. */
  scheme: z.enum(SCHEMES),
  colors: z.strictObject(
    Object.fromEntries(COLOR_KEYS.map((key) => [key, hexColor])) as Record<
      ColorKey,
      typeof hexColor
    >,
  ),
  fonts: z.strictObject({ heading: fontId, body: fontId }),
  shape: z.strictObject({
    radius: z.number().int().min(0).max(RADIUS_MAX),
    borderWidth: z.number().int().min(0).max(BORDER_WIDTH_MAX),
    borderStyle: z.enum(BORDER_STYLES),
    buttons: z.enum(BUTTON_SHAPES),
    shadow: z.enum(SHADOWS),
  }),
  density: z.enum(DENSITIES),
  /** `gradient` fades through the three hero colors. `solid` uses the middle one. */
  heroStyle: z.enum(HERO_STYLES),
})

export type Theme = z.infer<typeof themeSchema>
