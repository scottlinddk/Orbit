import { widgets as budgetWidgets } from '@orbit/module-budget/web'
import { widgets as calendarWidgets } from '@orbit/module-calendar/web'
import { widgets as listsWidgets } from '@orbit/module-lists/web'
import type { WidgetDefinition } from '@orbit/widget-sdk'

export interface WidgetRegistry {
  readonly all: readonly WidgetDefinition[]
  find(type: string): WidgetDefinition | undefined
}

/** Fails loudly at startup if two modules claim the same widget type. */
export function buildRegistry(definitions: readonly WidgetDefinition[]): WidgetRegistry {
  const byType = new Map<string, WidgetDefinition>()
  for (const definition of definitions) {
    if (byType.has(definition.type)) throw new Error(`Duplicate widget type: ${definition.type}`)
    byType.set(definition.type, definition)
  }
  return { all: definitions, find: (type) => byType.get(type) }
}

export const registry = buildRegistry([...calendarWidgets, ...listsWidgets, ...budgetWidgets])
