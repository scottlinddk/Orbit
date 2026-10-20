import type { DashboardResponse, WidgetResponse } from '@orbit/contracts'
import type { WidgetRegistry } from '../../widgets/registry.ts'
import { DashboardSettings } from './DashboardSettings.tsx'
import { WidgetLibrary } from './WidgetLibrary.tsx'
import { WidgetOptionsPanel } from './WidgetOptionsPanel.tsx'
import styles from './Sidebar.module.css'

interface Props {
  dashboard: DashboardResponse
  registry: WidgetRegistry
  selected: WidgetResponse | undefined
  selectedIndex: number
  busy: boolean
  onResize: (widgetId: string, span: number) => void
  onMove: (widgetId: string, toIndex: number) => void
  onConfig: (widgetId: string, config: Record<string, unknown>) => void
  onRemove: (widgetId: string) => void
  onClose: () => void
  onAnnounce: (message: string) => void
  onDeleted: () => void
}

/** Everything the editor shows beside the grid. Loaded only when an owner starts editing. */
export default function EditorSidebar(props: Props) {
  const { dashboard, registry, selected, busy } = props
  return (
    <>
      {selected ? (
        <WidgetOptionsPanel
          key={selected.id}
          placement={selected}
          definition={registry.find(selected.type)}
          columns={dashboard.columns}
          index={props.selectedIndex}
          count={dashboard.widgets.length}
          busy={busy}
          onResize={(span) => props.onResize(selected.id, span)}
          onMove={(toIndex) => props.onMove(selected.id, toIndex)}
          onConfig={(config) => props.onConfig(selected.id, config)}
          onRemove={() => props.onRemove(selected.id)}
          onClose={props.onClose}
        />
      ) : (
        <p className={styles.hint}>
          Select a widget to change its width, position and settings. Drag the handle to reorder.
        </p>
      )}
      <WidgetLibrary
        dashboard={dashboard}
        registry={registry}
        onAdded={(title) => props.onAnnounce(`Added ${title}`)}
      />
      <DashboardSettings
        dashboard={dashboard}
        onAnnounce={props.onAnnounce}
        onDeleted={props.onDeleted}
      />
    </>
  )
}
