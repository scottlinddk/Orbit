import { invariant } from './errors.ts'
import type { DashboardId, HouseholdId, WidgetPlacementId } from './ids.ts'

export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue }
export type JsonObject = { readonly [key: string]: JsonValue }

export const MAX_WIDGETS_PER_DASHBOARD = 50
export const COLUMN_OPTIONS = [1, 2, 3, 4] as const
export type Columns = (typeof COLUMN_OPTIONS)[number]

/** Identifies a widget implementation as `<module>.<widget>`, for example `calendar.agenda`. */
const WIDGET_TYPE = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/

export interface WidgetPlacement {
  readonly id: WidgetPlacementId
  readonly type: string
  /** Number of columns the widget occupies. Never larger than the dashboard's column count. */
  readonly span: number
  /**
   * Widget settings. Never put credentials here. Integrations keep secrets in the
   * SecretStore and reference them by id.
   */
  readonly config: JsonObject
}

export interface Dashboard {
  readonly id: DashboardId
  readonly householdId: HouseholdId
  readonly name: string
  readonly columns: Columns
  /** Display order is array order. */
  readonly widgets: readonly WidgetPlacement[]
}

function validName(name: string): string {
  const trimmed = name.trim()
  invariant(trimmed.length > 0 && trimmed.length <= 80, 'Dashboard name must be 1 to 80 characters')
  return trimmed
}

export function createDashboard(input: {
  id: DashboardId
  householdId: HouseholdId
  name: string
  columns?: Columns
}): Dashboard {
  return {
    id: input.id,
    householdId: input.householdId,
    name: validName(input.name),
    columns: input.columns ?? 3,
    widgets: [],
  }
}

export function renameDashboard(dashboard: Dashboard, name: string): Dashboard {
  return { ...dashboard, name: validName(name) }
}

/** Reducing the column count shrinks wider widgets so no widget exceeds the grid. */
export function setColumns(dashboard: Dashboard, columns: Columns): Dashboard {
  invariant(COLUMN_OPTIONS.includes(columns), 'Columns must be 1, 2, 3 or 4')
  return {
    ...dashboard,
    columns,
    widgets: dashboard.widgets.map((w) => ({ ...w, span: Math.min(w.span, columns) })),
  }
}

export function addWidget(
  dashboard: Dashboard,
  widget: { id: WidgetPlacementId; type: string; span?: number; config?: JsonObject },
  index: number = dashboard.widgets.length,
): Dashboard {
  invariant(WIDGET_TYPE.test(widget.type), 'Widget type must look like "module.widget"')
  invariant(
    dashboard.widgets.length < MAX_WIDGETS_PER_DASHBOARD,
    `A dashboard holds at most ${MAX_WIDGETS_PER_DASHBOARD} widgets`,
  )
  invariant(
    !dashboard.widgets.some((w) => w.id === widget.id),
    'A widget with this id is already on the dashboard',
  )
  const span = widget.span ?? 1
  invariant(
    Number.isInteger(span) && span >= 1 && span <= dashboard.columns,
    `Widget span must be a whole number between 1 and ${dashboard.columns}`,
  )
  invariant(
    Number.isInteger(index) && index >= 0 && index <= dashboard.widgets.length,
    'Index is outside the dashboard',
  )
  const placement: WidgetPlacement = {
    id: widget.id,
    type: widget.type,
    span,
    config: widget.config ?? {},
  }
  return {
    ...dashboard,
    widgets: [...dashboard.widgets.slice(0, index), placement, ...dashboard.widgets.slice(index)],
  }
}

export function removeWidget(dashboard: Dashboard, id: WidgetPlacementId): Dashboard {
  invariant(
    dashboard.widgets.some((w) => w.id === id),
    'Widget is not on the dashboard',
  )
  return { ...dashboard, widgets: dashboard.widgets.filter((w) => w.id !== id) }
}

/** Moves a widget so it ends up at `toIndex` in the resulting order. */
export function moveWidget(
  dashboard: Dashboard,
  id: WidgetPlacementId,
  toIndex: number,
): Dashboard {
  const from = dashboard.widgets.findIndex((w) => w.id === id)
  invariant(from !== -1, 'Widget is not on the dashboard')
  invariant(
    Number.isInteger(toIndex) && toIndex >= 0 && toIndex < dashboard.widgets.length,
    'Index is outside the dashboard',
  )
  const widgets = [...dashboard.widgets]
  const [moved] = widgets.splice(from, 1)
  widgets.splice(toIndex, 0, moved!)
  return { ...dashboard, widgets }
}
