/**
 * Turns what a person typed into `#rrggbb`, or `null` if it is not a color. Accepts `abc`,
 * `#abc`, `aabbcc` and `#AABBCC`.
 */
export function normalizeHex(text: string): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim())
  if (!match) return null
  const digits = match[1]!.toLowerCase()
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((d) => d + d)
          .join('')
      : digits
  return `#${full}`
}
