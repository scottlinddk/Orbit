import type { DashboardResponse } from '@orbit/contracts'
import { useAddWidget } from '../../api/dashboards.ts'
import { Alert } from '../../components/Alert.tsx'
import { Button } from '../../components/Button.tsx'
import type { WidgetRegistry } from '../../widgets/registry.ts'
import styles from './Sidebar.module.css'

interface Props {
  dashboard: DashboardResponse
  registry: WidgetRegistry
  onAdded: (title: string) => void
}

/** Every widget the installed modules offer. Adding one puts it at the end with its default width. */
export function WidgetLibrary({ dashboard, registry, onAdded }: Props) {
  const addWidget = useAddWidget(dashboard.id)
  return (
    <section className={styles.panel} aria-labelledby="library-heading">
      <h2 id="library-heading">Add a widget</h2>
      {addWidget.error ? <Alert>{addWidget.error.message}</Alert> : null}
      <ul className={styles.picker}>
        {registry.all.map((definition) => (
          <li key={definition.type} className={styles.option}>
            <div>
              <strong>{definition.title}</strong>
              {definition.status === 'preview' ? ' (preview)' : null}
              <p className={styles.description}>{definition.description}</p>
            </div>
            <Button
              busy={addWidget.isPending && addWidget.variables?.type === definition.type}
              onClick={() =>
                addWidget.mutate(
                  {
                    type: definition.type,
                    span: Math.min(definition.defaultSpan, dashboard.columns),
                  },
                  { onSuccess: () => onAdded(definition.title) },
                )
              }
              aria-label={`Add ${definition.title}`}
            >
              Add
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
