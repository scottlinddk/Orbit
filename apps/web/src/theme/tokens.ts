import { contrastRatio } from './contrast.ts'
import { fontStack } from './fonts/stacks.ts'
import type { Theme } from './schema.ts'

const SHADOWS = {
  none: 'none',
  soft: '0 1px 2px rgb(0 0 0 / 6%), 0 6px 20px rgb(0 0 0 / 7%)',
  strong: '0 2px 4px rgb(0 0 0 / 12%), 0 14px 36px rgb(0 0 0 / 20%)',
} as const

const DENSITY = { compact: '0.8', comfortable: '1', spacious: '1.25' } as const

const BUTTON_RADIUS = { pill: '999px', rounded: 'var(--radius-sm)', square: '0' } as const

/** A focus ring needs 3:1 against the page. The accent usually has it, and the text color always does. */
function focusColor(theme: Theme): string {
  const { accent, text, background } = theme.colors
  return contrastRatio(accent, background) >= 3 ? accent : text
}

/**
 * Every CSS custom property a theme controls. Components read only these, so applying a theme
 * is setting this list on the root element. Values come from validated hex colors, numbers and
 * catalog ids, never from free text.
 */
export function themeToCssVars(theme: Theme): Record<string, string> {
  const { colors, shape } = theme
  return {
    '--color-bg': colors.background,
    '--color-surface': colors.surface,
    '--color-surface-2': colors.surfaceRaised,
    '--color-text': colors.text,
    '--color-text-muted': colors.textMuted,
    '--color-border': colors.border,
    '--color-accent': colors.accent,
    '--color-accent-text': colors.accentText,
    '--color-focus': focusColor(theme),
    '--color-danger': colors.danger,
    '--color-success': colors.success,
    '--color-warning': colors.warning,
    '--hero-from': colors.heroFrom,
    '--hero-via': colors.heroVia,
    '--hero-to': colors.heroTo,
    '--hero-bg':
      theme.heroStyle === 'gradient'
        ? `linear-gradient(180deg, ${colors.heroFrom} 0%, ${colors.heroVia} 58%, ${colors.heroTo} 100%)`
        : colors.heroVia,
    '--color-hero-text': colors.heroText,
    '--font-heading': fontStack(theme.fonts.heading),
    '--font-body': fontStack(theme.fonts.body),
    '--radius': `${shape.radius}px`,
    '--radius-button': BUTTON_RADIUS[shape.buttons],
    '--border-width': `${shape.borderWidth}px`,
    '--border-style': shape.borderStyle,
    '--shadow': SHADOWS[shape.shadow],
    '--density': DENSITY[theme.density],
  }
}

export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(themeToCssVars(theme))) {
    root.style.setProperty(name, value)
  }
  root.style.colorScheme = theme.scheme
  root.dataset.scheme = theme.scheme
}
