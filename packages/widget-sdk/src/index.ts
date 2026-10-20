import type { ComponentType } from 'react'

export interface WidgetProps {
  /** Saved settings for this placement. Plain JSON, validated and size-limited by the API. */
  readonly config: Readonly<Record<string, unknown>>
  /** How many dashboard columns this placement occupies. */
  readonly span: number
}

export interface WidgetDefinition {
  /** `<module>.<widget>`. Stored in dashboards, so never rename it. */
  readonly type: string
  readonly title: string
  readonly description: string
  /** Columns a new placement occupies by default. */
  readonly defaultSpan: number
  /** `preview` marks widgets that show a placeholder until their data source exists. */
  readonly status: 'stable' | 'preview'
  readonly Component: ComponentType<WidgetProps>
}

/** Identity helper that gives modules type checking and autocomplete. */
export const defineWidget = (definition: WidgetDefinition): WidgetDefinition => definition
