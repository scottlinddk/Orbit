import { createContext, useContext } from 'react'
import type { Theme } from './schema.ts'

export interface ThemeApi {
  /** The theme in effect: the saved one, else Ember in the device's color scheme. */
  readonly theme: Theme
  /** True once the person has chosen or edited a theme, so it is saved in this browser. */
  readonly customized: boolean
  setTheme(theme: Theme): void
  /** Back to the default. Forgets the saved theme. */
  reset(): void
  /** Replaces the theme with one from exported text. Returns false if the text is not a valid theme. */
  importTheme(text: string): boolean
}

export const ThemeContext = createContext<ThemeApi | null>(null)

export function useTheme(): ThemeApi {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside ThemeProvider')
  return value
}
