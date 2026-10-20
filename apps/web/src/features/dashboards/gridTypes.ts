import type { DashboardResponse } from '@orbit/contracts'
import type { WidgetRegistry } from '../../widgets/registry.ts'

export interface GridProps {
  dashboard: DashboardResponse
  registry: WidgetRegistry
  editing: boolean
  busy: boolean
  selectedId: string | null
  onSelect: (widgetId: string) => void
  onMove: (widgetId: string, toIndex: number) => void
  onResize: (widgetId: string, span: number) => void
  onRemove: (widgetId: string) => void
}
