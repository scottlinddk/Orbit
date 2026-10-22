export const REFRESH_DEFAULT_SECONDS = 60
export const REFRESH_MIN_SECONDS = 15
export const REFRESH_MAX_SECONDS = 3600
export const SCALE_DEFAULT = 1
export const SCALE_MIN = 0.75
export const SCALE_MAX = 3

const SCALE_KEY = 'orbit.kiosk.scale'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** `?refresh=30` in seconds. Anything unusable falls back to the default, and the range is bounded. */
export function parseRefreshSeconds(raw: string | null): number {
  const value = raw === null || raw.trim() === '' ? Number.NaN : Number(raw)
  if (!Number.isFinite(value)) return REFRESH_DEFAULT_SECONDS
  return clamp(Math.round(value), REFRESH_MIN_SECONDS, REFRESH_MAX_SECONDS)
}

/** `?scale=1.5`. Null when absent or unusable, so the caller can fall back to the saved value. */
export function parseScale(raw: string | null): number | null {
  const value = raw === null || raw.trim() === '' ? Number.NaN : Number(raw)
  if (!Number.isFinite(value)) return null
  return clamp(Math.round(value * 100) / 100, SCALE_MIN, SCALE_MAX)
}

/** Storage can be blocked (private windows, kiosk browsers), so every access is guarded. */
export function loadScale(): number | null {
  try {
    return parseScale(window.localStorage.getItem(SCALE_KEY))
  } catch {
    return null
  }
}

export function saveScale(scale: number): void {
  try {
    window.localStorage.setItem(SCALE_KEY, String(scale))
  } catch {
    // Not saving is fine: the address still carries the setting.
  }
}
