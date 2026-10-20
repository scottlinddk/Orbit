import type { DashboardResponse } from '@orbit/contracts'
import type { CSSProperties } from 'react'
import { Button } from '../../components/Button.tsx'
import { WidgetBody } from '../../widgets/WidgetBody.tsx'
import type { WidgetRegistry } from '../../widgets/registry.ts'
import styles from './DashboardGrid.module.css'

interface Props {
  dashboard: DashboardResponse
  registry: WidgetRegistry
  editing: boolean
  busy: boolean
  onMove: (widgetId: string, toIndex: number) => void
  onRemove: (widgetId: string) => void
}

export function DashboardGrid({ dashboard, registry, editing, busy, onMove, onRemove }: Props) {
  const count = dashboard.widgets.length
  return (
    <ul
      className={styles.grid}
      style={{ '--columns': dashboard.columns } as CSSProperties}
      aria-label={`${dashboard.name} widgets`}
    >
      {dashboard.widgets.map((placement, index) => {
        const definition = registry.find(placement.type)
        const title = definition?.title ?? placement.type
        return (
          <li
            key={placement.id}
            className={styles.cell}
            style={{ '--span': placement.span } as CSSProperties}
          >
            <article className={styles.card} aria-label={title}>
              <header className={styles.cardHeader}>
                <h2 className={styles.title}>{title}</h2>
                {definition?.status === 'preview' ? (
                  <span className={styles.badge}>Preview</span>
                ) : null}
              </header>
              <WidgetBody placement={placement} definition={definition} />
              {editing ? (
                <footer className={styles.controls}>
                  <Button
                    disabled={busy || index === 0}
                    onClick={() => onMove(placement.id, index - 1)}
                    aria-label={`Move ${title} earlier`}
                  >
                    ↑ Earlier
                  </Button>
                  <Button
                    disabled={busy || index === count - 1}
                    onClick={() => onMove(placement.id, index + 1)}
                    aria-label={`Move ${title} later`}
                  >
                    ↓ Later
                  </Button>
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={() => onRemove(placement.id)}
                    aria-label={`Remove ${title}`}
                  >
                    Remove
                  </Button>
                </footer>
              ) : null}
            </article>
          </li>
        )
      })}
    </ul>
  )
}
