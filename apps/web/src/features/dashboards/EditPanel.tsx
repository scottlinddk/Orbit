import type { DashboardResponse } from '@orbit/contracts'
import { useState, type FormEvent } from 'react'
import {
  useAddWidget,
  useDeleteDashboard,
  useRenameDashboard,
  useSetColumns,
} from '../../api/dashboards.ts'
import { Alert } from '../../components/Alert.tsx'
import { Button } from '../../components/Button.tsx'
import { TextField } from '../../components/TextField.tsx'
import type { WidgetRegistry } from '../../widgets/registry.ts'
import styles from './EditPanel.module.css'

interface Props {
  dashboard: DashboardResponse
  registry: WidgetRegistry
  onDeleted: () => void
  onAnnounce: (message: string) => void
}

export function EditPanel({ dashboard, registry, onDeleted, onAnnounce }: Props) {
  const [name, setName] = useState(dashboard.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const rename = useRenameDashboard(dashboard.id)
  const setColumns = useSetColumns(dashboard.id)
  const addWidget = useAddWidget(dashboard.id)
  const remove = useDeleteDashboard(dashboard.id, dashboard.householdId)

  const error = rename.error ?? setColumns.error ?? addWidget.error ?? remove.error

  function submitName(event: FormEvent) {
    event.preventDefault()
    rename.mutate(name, { onSuccess: () => onAnnounce(`Renamed to ${name}`) })
  }

  return (
    <section className={styles.panel} aria-labelledby="edit-heading">
      <h2 id="edit-heading">Edit dashboard</h2>
      {error ? <Alert>{error.message}</Alert> : null}

      <form onSubmit={submitName} className={styles.row}>
        <TextField
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          required
        />
        <Button type="submit" busy={rename.isPending} disabled={name.trim() === dashboard.name}>
          Rename
        </Button>
      </form>

      <div className={styles.field}>
        <label htmlFor="columns" className={styles.label}>
          Columns
        </label>
        <select
          id="columns"
          className={styles.select}
          value={dashboard.columns}
          disabled={setColumns.isPending}
          onChange={(e) => setColumns.mutate(Number(e.target.value) as 1 | 2 | 3 | 4)}
        >
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <h3>Add a widget</h3>
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
                  { onSuccess: () => onAnnounce(`Added ${definition.title}`) },
                )
              }
              aria-label={`Add ${definition.title}`}
            >
              Add
            </Button>
          </li>
        ))}
      </ul>

      <h3>Danger zone</h3>
      {confirmDelete ? (
        <div className={styles.row}>
          <p>Delete “{dashboard.name}” and its widgets? This cannot be undone.</p>
          <Button
            variant="danger"
            busy={remove.isPending}
            onClick={() => remove.mutate(undefined, { onSuccess: onDeleted })}
          >
            Yes, delete it
          </Button>
          <Button onClick={() => setConfirmDelete(false)}>Keep it</Button>
        </div>
      ) : (
        <div className={styles.start}>
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Delete dashboard
          </Button>
        </div>
      )}
    </section>
  )
}
