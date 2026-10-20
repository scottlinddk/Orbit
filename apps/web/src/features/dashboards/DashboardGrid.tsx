import { lazy, Suspense, type CSSProperties } from 'react'
import { Loading } from '../../components/Loading.tsx'
import { WidgetCard } from './WidgetCard.tsx'
import type { GridProps } from './gridTypes.ts'
import styles from './DashboardGrid.module.css'

// Drag and drop is only for owners who chose Edit, so it is loaded when they do.
const EditableGrid = lazy(() => import('./EditableGrid.tsx'))

export function DashboardGrid(props: GridProps) {
  if (props.editing) {
    return (
      <Suspense fallback={<Loading label="Loading the editor" />}>
        <EditableGrid {...props} />
      </Suspense>
    )
  }
  const { dashboard, registry } = props
  return (
    <ul
      className={styles.grid}
      style={{ '--columns': dashboard.columns } as CSSProperties}
      aria-label={`${dashboard.name} widgets`}
    >
      {dashboard.widgets.map((placement) => (
        <li
          key={placement.id}
          className={styles.cell}
          style={{ '--span': placement.span } as CSSProperties}
        >
          <WidgetCard
            placement={placement}
            definition={registry.find(placement.type)}
            editing={false}
            selected={false}
            busy={false}
            onSelect={() => {}}
            onRemove={() => {}}
          />
        </li>
      ))}
    </ul>
  )
}
