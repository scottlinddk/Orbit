import type { WidgetDefinition } from '@orbit/widget-sdk'
import type { WidgetResponse } from '@orbit/contracts'
import { PlacementIdContext } from './placementContext.ts'
import { WidgetBoundary } from './WidgetBoundary.tsx'

interface Props {
  placement: WidgetResponse
  definition: WidgetDefinition | undefined
}

export function WidgetBody({ placement, definition }: Props) {
  // Dashboards outlive code: a widget type can disappear. Keep the placement, say why it is empty.
  if (!definition) {
    return <p>Unknown widget “{placement.type}”. It stays on the dashboard but cannot be shown.</p>
  }
  const { Component } = definition
  return (
    <WidgetBoundary type={placement.type}>
      <PlacementIdContext.Provider value={placement.id}>
        <Component config={placement.config} span={placement.span} />
      </PlacementIdContext.Provider>
    </WidgetBoundary>
  )
}
