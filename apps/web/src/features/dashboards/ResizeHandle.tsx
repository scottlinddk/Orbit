import { useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { ResizeIcon } from '../../components/icons.tsx'
import styles from './ResizeHandle.module.css'

interface Props {
  title: string
  span: number
  columns: number
  /** The grid the card sits in. Its width gives the width of one column. */
  gridRef: { readonly current: HTMLElement | null }
  /** Called while dragging, with the span the card would get. `null` when the drag ends. */
  onPreview: (span: number | null) => void
  onResize: (span: number) => void
}

/**
 * Changes how many columns a card spans. Drag it sideways (the card snaps to whole columns)
 * or focus it and use the arrow keys, because a drag is no use without a pointer.
 */
export function ResizeHandle({ title, span, columns, gridRef, onPreview, onResize }: Props) {
  const drag = useRef<{ startX: number; startSpan: number; column: number; span: number } | null>(
    null,
  )

  const clamp = (value: number) => Math.min(columns, Math.max(1, value))

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    const grid = gridRef.current
    if (!grid || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      startX: event.clientX,
      startSpan: span,
      column: grid.getBoundingClientRect().width / columns,
      span,
    }
    onPreview(span)
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = drag.current
    if (!current || current.column <= 0) return
    const next = clamp(
      Math.round(current.startSpan + (event.clientX - current.startX) / current.column),
    )
    if (next !== current.span) {
      current.span = next
      onPreview(next)
    }
  }

  function finish(commit: boolean) {
    const current = drag.current
    drag.current = null
    onPreview(null)
    if (commit && current && current.span !== current.startSpan) onResize(current.span)
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const steps: Record<string, number> = {
      ArrowRight: span + 1,
      ArrowUp: span + 1,
      ArrowLeft: span - 1,
      ArrowDown: span - 1,
      Home: 1,
      End: columns,
    }
    const next = steps[event.key]
    if (next === undefined) return
    event.preventDefault()
    if (clamp(next) !== span) onResize(clamp(next))
  }

  return (
    <button
      type="button"
      role="slider"
      className={styles.handle}
      aria-label={`Width of ${title}`}
      aria-orientation="horizontal"
      aria-valuemin={1}
      aria-valuemax={columns}
      aria-valuenow={span}
      aria-valuetext={`${span} of ${columns} ${columns === 1 ? 'column' : 'columns'}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => finish(true)}
      onPointerCancel={() => finish(false)}
      onKeyDown={onKeyDown}
    >
      <ResizeIcon />
    </button>
  )
}
