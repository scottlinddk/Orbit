import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import type { WidgetResponse } from '@orbit/contracts'
import type { WidgetDefinition } from '@orbit/widget-sdk'
import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ResizeHandle } from './ResizeHandle.tsx'
import { WidgetCard } from './WidgetCard.tsx'
import type { GridProps } from './gridTypes.ts'
import styles from './DashboardGrid.module.css'

/**
 * Cards keep their place while one is dragged. The dragged card lands where it is dropped, in
 * the same sense as the "Move earlier" and "Move later" buttons. Cards have different widths, so
 * sliding the others out of the way (the library's default) would show positions that do not
 * match what is saved.
 */
const noShift = () => null

/**
 * Cards differ in width, so the card under the pointer is the one meant, not the one nearest to
 * the dragged card's own centre. A keyboard drag has no pointer, and falls back to centres.
 */
const collisions: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args)
  return underPointer.length > 0 ? underPointer : closestCenter(args)
}

/** The dashboard grid in edit mode: cards can be dragged, resized and selected. */
export default function EditableGrid(props: GridProps) {
  const { dashboard, registry } = props
  const gridRef = useRef<HTMLUListElement>(null)
  const [preview, setPreview] = useState<{ id: string; span: number } | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    // A small distance keeps a plain click (select) from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const titleOf = (id: string) => {
    const placement = dashboard.widgets.find((w) => w.id === id)
    return (placement && registry.find(placement.type)?.title) ?? 'widget'
  }
  const position = (id: string) => dashboard.widgets.findIndex((w) => w.id === id) + 1
  const count = dashboard.widgets.length

  // Spoken by screen readers while dragging. The result of the drop is announced by the page
  // once the server confirms it, so the drop itself says nothing here.
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${titleOf(String(active.id))}, position ${position(String(active.id))} of ${count}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${titleOf(String(active.id))} is over position ${position(String(over.id))} of ${count}.`
        : undefined,
    onDragEnd: () => undefined,
    onDragCancel: ({ active }) => `Cancelled. ${titleOf(String(active.id))} did not move.`,
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
    props.onSelect(String(event.active.id))
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    if (!over || active.id === over.id) return
    const toIndex = dashboard.widgets.findIndex((w) => w.id === over.id)
    if (toIndex !== -1) props.onMove(String(active.id), toIndex)
  }

  const active = dashboard.widgets.find((w) => w.id === activeId)
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisions}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'Press space or enter to pick up a widget. Use the arrow keys to choose a new position, then press space or enter to drop it, or escape to cancel.',
        },
      }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={dashboard.widgets.map((w) => w.id)} strategy={noShift}>
        <ul
          ref={gridRef}
          className={styles.grid}
          style={{ '--columns': dashboard.columns } as CSSProperties}
          aria-label={`${dashboard.name} widgets`}
        >
          {dashboard.widgets.map((placement) => {
            const definition = registry.find(placement.type)
            return (
              <SortableCell
                key={placement.id}
                placement={placement}
                definition={definition}
                span={preview?.id === placement.id ? preview.span : placement.span}
                selected={props.selectedId === placement.id}
                busy={props.busy}
                onSelect={() => props.onSelect(placement.id)}
                onRemove={() => props.onRemove(placement.id)}
              >
                <ResizeHandle
                  title={definition?.title ?? placement.type}
                  span={placement.span}
                  columns={dashboard.columns}
                  gridRef={gridRef}
                  onPreview={(next) =>
                    setPreview(next === null ? null : { id: placement.id, span: next })
                  }
                  onResize={(next) => props.onResize(placement.id, next)}
                />
              </SortableCell>
            )
          })}
        </ul>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {active ? <div className={styles.ghost}>{titleOf(active.id)}</div> : null}
      </DragOverlay>
    </DndContext>
  )
}

interface CellProps {
  placement: WidgetResponse
  definition: WidgetDefinition | undefined
  span: number
  selected: boolean
  busy: boolean
  onSelect: () => void
  onRemove: () => void
  children: ReactNode
}

function SortableCell({ span, children, ...card }: CellProps) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging, isOver } =
    useSortable({ id: card.placement.id })
  return (
    <li
      ref={setNodeRef}
      className={`${styles.cell} ${isDragging ? styles.dragging : ''} ${isOver && !isDragging ? styles.dropTarget : ''}`}
      style={{ '--span': span } as CSSProperties}
    >
      <WidgetCard
        {...card}
        editing
        dragHandleRef={setActivatorNodeRef}
        // dnd-kit adds role="button" and aria attributes; the handle is already a button.
        dragHandleProps={{ ...attributes, ...listeners, role: undefined }}
      >
        {children}
      </WidgetCard>
    </li>
  )
}
