import type { PlanetWidgetResponse } from '@orbit/contracts'
import { defineWidget, type WidgetDefinition, type WidgetOption } from '@orbit/widget-sdk'
import { createElement } from 'react'
import { PlanetWidget } from './PlanetWidget.tsx'

/** Turns an installed Planet into a widget definition, so the editor treats it like any other. */
export function planetDefinition(info: PlanetWidgetResponse): WidgetDefinition {
  return defineWidget({
    type: info.type,
    title: info.title,
    description: info.description,
    defaultSpan: info.defaultSpan,
    status: 'stable',
    // The API sends the same shapes as `WidgetOption`; only optional-key typing differs.
    options: info.options as unknown as readonly WidgetOption[],
    Component: () => createElement(PlanetWidget, { title: info.title }),
  })
}
