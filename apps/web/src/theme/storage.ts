import { themeSchema, type Theme } from './schema.ts'

/** Versioned, so a future theme format can migrate or discard what is here. */
export const STORAGE_KEY = 'orbit.theme.v1'

/**
 * Storage can be missing or throw (private windows, blocked site data), so every access is
 * guarded and the app renders with the default theme without it.
 */
export function loadTheme(storage: Pick<Storage, 'getItem'> = window.localStorage): Theme | null {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    return raw === null ? null : parseTheme(raw)
  } catch {
    return null
  }
}

export function saveTheme(theme: Theme, storage: Pick<Storage, 'setItem'> = window.localStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(theme))
    return true
  } catch {
    return false
  }
}

export function clearTheme(storage: Pick<Storage, 'removeItem'> = window.localStorage) {
  try {
    storage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

/** Stored and imported text are untrusted: a bad or tampered theme becomes `null`, never a crash. */
export function parseTheme(text: string): Theme | null {
  try {
    const parsed = themeSchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function serializeTheme(theme: Theme): string {
  return JSON.stringify(theme, null, 2) + '\n'
}
