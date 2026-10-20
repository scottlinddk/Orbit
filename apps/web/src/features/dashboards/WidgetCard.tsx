import type { WidgetResponse } from '@orbit/contracts'
import type { WidgetDefinition } from '@orbit/widget-sdk'
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode, Ref } from 'react'
import { CloseIcon, GripIcon, SlidersIcon } from '../../components/icons.tsx'
import { WidgetBody } from '../../widgets/WidgetBody.tsx'
import styles from './WidgetCard.module.css'

export interface WidgetCardProps {
  placement: WidgetResponse
  definition: WidgetDefinition | undefined
  editing: boolean
  selected: boolean
  busy: boolean
  /** Props that make the drag handle start a drag. Only given while the cards can be reordered. */
  dragHandleProps?: ButtonHTMLAttributes<HTMLButtonElement> | undefined
  dragHandleRef?: Ref<HTMLButtonElement> | undefined
  onSelect: () => void
  onRemove: () => void
  /** Extra props for the card element, such as a drop highlight. */
  cardProps?: HTMLAttributes<HTMLElement> | undefined
  children?: ReactNode
}

/**
 * The frame around one widget: title, tone, and the editing controls. The widget itself only
 * draws its body, so every widget gets the same chrome and the same theme.
 */
export function WidgetCard({
  placement,
  definition,
  editing,
  selected,
  busy,
  dragHandleProps,
  dragHandleRef,
  onSelect,
  onRemove,
  cardProps,
  children,
}: WidgetCardProps) {
  const title = definition?.title ?? placement.type
  const accent = definition?.tone === 'accent'
  const classes = [
    styles.card,
    accent && styles.accent,
    editing && styles.editing,
    selected && styles.selected,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <article
      {...cardProps}
      className={`${classes} ${cardProps?.className ?? ''}`.trim()}
      aria-label={title}
      onClick={editing ? onSelect : undefined}
    >
      <header className={styles.header}>
        {editing && dragHandleProps ? (
          <button
            ref={dragHandleRef}
            type="button"
            className={styles.tool}
            aria-label={`Drag ${title} to reorder`}
            {...dragHandleProps}
          >
            <GripIcon />
          </button>
        ) : null}
        <h2 className={styles.title}>{title}</h2>
        {definition?.status === 'preview' ? <span className={styles.badge}>Preview</span> : null}
        {editing ? (
          <span className={styles.tools}>
            <button
              type="button"
              className={styles.tool}
              aria-label={`Options for ${title}`}
              aria-pressed={selected}
              onClick={(event) => {
                event.stopPropagation()
                onSelect()
              }}
            >
              <SlidersIcon />
            </button>
            <button
              type="button"
              className={styles.tool}
              aria-label={`Remove ${title}`}
              disabled={busy}
              onClick={(event) => {
                event.stopPropagation()
                onRemove()
              }}
            >
              <CloseIcon />
            </button>
          </span>
        ) : null}
      </header>
      <div className={styles.body}>
        <WidgetBody placement={placement} definition={definition} />
      </div>
      {children}
    </article>
  )
}
