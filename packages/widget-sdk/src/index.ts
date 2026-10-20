import type { ComponentType } from 'react'

export interface WidgetProps {
  /** Saved settings for this placement. Plain JSON, validated and size-limited by the API. */
  readonly config: Readonly<Record<string, unknown>>
  /** How many dashboard columns this placement occupies. */
  readonly span: number
}

interface OptionBase {
  /** Key in the placement's `config`. Stored in dashboards, so never rename it. */
  readonly key: string
  readonly label: string
  /** One sentence shown under the field. */
  readonly help?: string
}

/**
 * One setting a widget accepts. The dashboard editor draws a form from these, so a widget
 * gets an options panel without shipping any editor UI of its own.
 */
export type WidgetOption =
  | (OptionBase & {
      readonly kind: 'select'
      readonly choices: readonly { readonly value: string; readonly label: string }[]
      readonly default: string
    })
  | (OptionBase & {
      readonly kind: 'number'
      readonly min: number
      readonly max: number
      readonly step?: number
      readonly default: number
    })
  | (OptionBase & { readonly kind: 'toggle'; readonly default: boolean })
  | (OptionBase & {
      readonly kind: 'text'
      readonly maxLength: number
      readonly default: string
    })

export type OptionValue = string | number | boolean

export interface WidgetDefinition {
  /** `<module>.<widget>`. Stored in dashboards, so never rename it. */
  readonly type: string
  readonly title: string
  readonly description: string
  /** Columns a new placement occupies by default. */
  readonly defaultSpan: number
  /** `preview` marks widgets that show a placeholder until their data source exists. */
  readonly status: 'stable' | 'preview'
  /**
   * How the dashboard paints the card around the widget. `accent` is the theme's highlight
   * card (a gradient in the default theme); the widget should then draw with `currentColor`.
   * Defaults to `surface`.
   */
  readonly tone?: 'surface' | 'accent'
  /** Settings the user can change in the editor. Read them with `resolveOptions`. */
  readonly options?: readonly WidgetOption[]
  readonly Component: ComponentType<WidgetProps>
}

/** Identity helper that gives modules type checking and autocomplete. */
export const defineWidget = (definition: WidgetDefinition): WidgetDefinition => definition

/**
 * The effective value of every option: what is saved if it is valid, else the default.
 * Saved config is untrusted (older versions, hand-edited rows), so a bad value never throws.
 */
export function resolveOptions(
  options: readonly WidgetOption[] | undefined,
  config: Readonly<Record<string, unknown>>,
): Record<string, OptionValue> {
  const resolved: Record<string, OptionValue> = {}
  for (const option of options ?? []) {
    const saved = config[option.key]
    switch (option.kind) {
      case 'select':
        resolved[option.key] =
          typeof saved === 'string' && option.choices.some((c) => c.value === saved)
            ? saved
            : option.default
        break
      case 'number':
        resolved[option.key] =
          typeof saved === 'number' && Number.isFinite(saved)
            ? Math.min(option.max, Math.max(option.min, saved))
            : option.default
        break
      case 'toggle':
        resolved[option.key] = typeof saved === 'boolean' ? saved : option.default
        break
      case 'text':
        resolved[option.key] =
          typeof saved === 'string' ? saved.slice(0, option.maxLength) : option.default
        break
    }
  }
  return resolved
}
