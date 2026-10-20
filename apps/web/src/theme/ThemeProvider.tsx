import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { ensureFont } from './fonts/loader.ts'
import { systemTheme } from './presets.ts'
import type { Theme } from './schema.ts'
import { clearTheme, loadTheme, parseTheme, saveTheme } from './storage.ts'
import { applyTheme } from './tokens.ts'
import { ThemeContext, type ThemeApi } from './ThemeContext.ts'

const DARK_QUERY = '(prefers-color-scheme: dark)'

function deviceIsDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches
}

/**
 * Applies the theme before React renders, so the first paint already has the right colors.
 * Opening any page with `?reset-theme` forgets a saved theme. It is the way back if a custom
 * theme ever made the app unreadable.
 */
export function bootTheme(): void {
  const url = new URL(window.location.href)
  if (url.searchParams.has('reset-theme')) {
    clearTheme()
    url.searchParams.delete('reset-theme')
    window.history.replaceState(null, '', url)
  }
  const theme = loadTheme() ?? systemTheme(deviceIsDark())
  applyTheme(theme)
  void ensureFont(theme.fonts.heading)
  void ensureFont(theme.fonts.body)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<Theme | null>(() => loadTheme())
  const [dark, setDark] = useState(deviceIsDark)

  // Follow the device's color scheme, but only while no theme was chosen.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(DARK_QUERY)
    const onChange = (event: MediaQueryListEvent) => setDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const theme = saved ?? systemTheme(dark)

  useLayoutEffect(() => {
    applyTheme(theme)
  }, [theme])

  const { heading, body } = theme.fonts
  useEffect(() => {
    void ensureFont(heading)
    void ensureFont(body)
  }, [heading, body])

  const setTheme = useCallback((next: Theme) => {
    setSaved(next)
    saveTheme(next)
  }, [])

  const reset = useCallback(() => {
    setSaved(null)
    clearTheme()
  }, [])

  const importTheme = useCallback(
    (text: string) => {
      const parsed = parseTheme(text)
      if (!parsed) return false
      setTheme(parsed)
      return true
    },
    [setTheme],
  )

  const value = useMemo<ThemeApi>(
    () => ({ theme, customized: saved !== null, setTheme, reset, importTheme }),
    [theme, saved, setTheme, reset, importTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
