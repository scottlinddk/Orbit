/** WCAG 2.x contrast math, so the editor can warn before a theme becomes unreadable. */

function channel(value: number): number {
  const s = value / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  )
}

/** 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

export type Grade = 'AAA' | 'AA' | 'large' | 'fail'

/** `large` passes only for large text (3:1), which most body text is not. */
export function grade(ratio: number): Grade {
  if (ratio >= 7) return 'AAA'
  if (ratio >= 4.5) return 'AA'
  if (ratio >= 3) return 'large'
  return 'fail'
}

/** Whichever of black or white reads better on `background`. */
export function readableOn(background: string): '#000000' | '#ffffff' {
  return contrastRatio('#ffffff', background) >= contrastRatio('#000000', background)
    ? '#ffffff'
    : '#000000'
}
