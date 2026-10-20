import { findFont, type FontId } from './stacks.ts'

const pending = new Map<FontId, Promise<void>>()

/** Browsers without the FontFace API (and jsdom) keep the fallback stack. */
const supported = () => typeof FontFace !== 'undefined' && typeof document !== 'undefined'

/**
 * Loads a font once. Resolves when it is ready or when it could not load, and never rejects:
 * a font that fails to load leaves the system fallback in place and the app usable.
 * The files are same-origin, so the CSP (`font-src 'self'`) allows them.
 */
export function ensureFont(id: FontId): Promise<void> {
  const font = findFont(id)
  if (!font || !supported()) return Promise.resolve()
  const existing = pending.get(id)
  if (existing) return existing

  const load = font
    .files()
    .then(async (urls) => {
      const faces = [
        new FontFace(font.family, `url(${urls.latin}) format('woff2-variations')`, {
          weight: font.weight,
          style: 'normal',
          display: 'swap',
          unicodeRange: font.ranges.latin,
        }),
        new FontFace(font.family, `url(${urls.latinExt}) format('woff2-variations')`, {
          weight: font.weight,
          style: 'normal',
          display: 'swap',
          unicodeRange: font.ranges.latinExt,
        }),
      ]
      await Promise.all(
        faces.map(async (face) => {
          await face.load()
          document.fonts.add(face)
        }),
      )
    })
    .catch((error: unknown) => {
      // Allow another attempt, for example after a flaky network.
      pending.delete(id)
      console.warn(`Font ${font.label} could not be loaded`, error)
    })
  pending.set(id, load)
  return load
}
