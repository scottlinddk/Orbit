import { describe, expect, it } from 'vitest'
import {
  DashboardId,
  HouseholdId,
  InvariantViolation,
  MAX_WIDGETS_PER_DASHBOARD,
  WidgetPlacementId,
  addWidget,
  configureWidget,
  createDashboard,
  moveWidget,
  removeWidget,
  renameDashboard,
  resizeWidget,
  setColumns,
} from './index.ts'

const w = (id: string, type = 'calendar.agenda') => ({ id: WidgetPlacementId(id), type })
const empty = () =>
  createDashboard({ id: DashboardId('d1'), householdId: HouseholdId('h1'), name: 'Week' })
const ids = (d: ReturnType<typeof empty>) => d.widgets.map((x) => x.id)

describe('dashboard', () => {
  it('starts empty with three columns', () => {
    const d = empty()
    expect(d.columns).toBe(3)
    expect(d.widgets).toEqual([])
  })

  it('renames with validation', () => {
    expect(renameDashboard(empty(), ' Kitchen ').name).toBe('Kitchen')
    expect(() => renameDashboard(empty(), '')).toThrow(InvariantViolation)
  })

  it('appends widgets by default and inserts at an index', () => {
    let d = addWidget(empty(), w('a'))
    d = addWidget(d, w('b'))
    d = addWidget(d, w('c'), 0)
    expect(ids(d)).toEqual(['c', 'a', 'b'])
  })

  it('applies defaults for span and config', () => {
    const [p] = addWidget(empty(), w('a')).widgets
    expect(p).toMatchObject({ span: 1, config: {} })
  })

  it('rejects malformed widget types', () => {
    for (const type of ['', 'calendar', 'Calendar.agenda', 'calendar.', '../x.y']) {
      expect(() => addWidget(empty(), w('a', type))).toThrow(InvariantViolation)
    }
  })

  it('rejects duplicate widget ids, bad spans and bad indexes', () => {
    const d = addWidget(empty(), w('a'))
    expect(() => addWidget(d, w('a'))).toThrow('already on the dashboard')
    expect(() => addWidget(d, { ...w('b'), span: 4 })).toThrow(InvariantViolation)
    expect(() => addWidget(d, { ...w('b'), span: 0 })).toThrow(InvariantViolation)
    expect(() => addWidget(d, { ...w('b'), span: 1.5 })).toThrow(InvariantViolation)
    expect(() => addWidget(d, w('b'), 2)).toThrow(InvariantViolation)
    expect(() => addWidget(d, w('b'), -1)).toThrow(InvariantViolation)
  })

  it('caps the number of widgets', () => {
    let d = empty()
    for (let i = 0; i < MAX_WIDGETS_PER_DASHBOARD; i++) d = addWidget(d, w(`w${i}`))
    expect(() => addWidget(d, w('extra'))).toThrow('at most')
  })

  it('removes widgets and rejects unknown ones', () => {
    const d = addWidget(addWidget(empty(), w('a')), w('b'))
    expect(ids(removeWidget(d, WidgetPlacementId('a')))).toEqual(['b'])
    expect(() => removeWidget(d, WidgetPlacementId('zzz'))).toThrow(InvariantViolation)
  })

  it('reorders widgets so the widget lands at the target index', () => {
    let d = empty()
    for (const id of ['a', 'b', 'c', 'd']) d = addWidget(d, w(id))
    expect(ids(moveWidget(d, WidgetPlacementId('a'), 3))).toEqual(['b', 'c', 'd', 'a'])
    expect(ids(moveWidget(d, WidgetPlacementId('d'), 0))).toEqual(['d', 'a', 'b', 'c'])
    expect(ids(moveWidget(d, WidgetPlacementId('b'), 1))).toEqual(['a', 'b', 'c', 'd'])
    expect(() => moveWidget(d, WidgetPlacementId('a'), 4)).toThrow(InvariantViolation)
    expect(() => moveWidget(d, WidgetPlacementId('nope'), 0)).toThrow(InvariantViolation)
  })

  it('shrinks spans when columns are reduced', () => {
    const d = addWidget(empty(), { ...w('a'), span: 3 })
    const narrowed = setColumns(d, 2)
    expect(narrowed.columns).toBe(2)
    expect(narrowed.widgets[0]?.span).toBe(2)
  })

  it('rejects invalid column counts', () => {
    expect(() => setColumns(empty(), 5 as never)).toThrow(InvariantViolation)
  })

  it('resizes one widget within the grid and leaves the others alone', () => {
    const d = addWidget(addWidget(empty(), w('a')), w('b'))
    const resized = resizeWidget(d, WidgetPlacementId('a'), 3)
    expect(resized.widgets.map((x) => x.span)).toEqual([3, 1])
    expect(() => resizeWidget(d, WidgetPlacementId('a'), 4)).toThrow(InvariantViolation)
    expect(() => resizeWidget(d, WidgetPlacementId('a'), 0)).toThrow(InvariantViolation)
    expect(() => resizeWidget(d, WidgetPlacementId('a'), 1.5)).toThrow(InvariantViolation)
    expect(() => resizeWidget(d, WidgetPlacementId('nope'), 2)).toThrow(InvariantViolation)
  })

  it('replaces the settings of one widget', () => {
    const d = addWidget(addWidget(empty(), { ...w('a'), config: { days: 3 } }), w('b'))
    const configured = configureWidget(d, WidgetPlacementId('a'), { days: 7, mode: 'week' })
    expect(configured.widgets[0]!.config).toEqual({ days: 7, mode: 'week' })
    expect(configured.widgets[1]!.config).toEqual({})
    expect(() => configureWidget(d, WidgetPlacementId('nope'), {})).toThrow(InvariantViolation)
  })
})
