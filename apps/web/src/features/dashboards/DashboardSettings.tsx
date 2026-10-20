import type { DashboardResponse } from '@orbit/contracts'
import { useState, type FormEvent } from 'react'
import { useDeleteDashboard, useRenameDashboard, useSetColumns } from '../../api/dashboards.ts'
import { Alert } from '../../components/Alert.tsx'
import { Button } from '../../components/Button.tsx'
import { TextField } from '../../components/TextField.tsx'
import styles from './Sidebar.module.css'

interface Props {
  dashboard: DashboardResponse
  onDeleted: () => void
  onAnnounce: (message: string) => void
}

export function DashboardSettings({ dashboard, onDeleted, onAnnounce }: Props) {
  const [name, setName] = useState(dashboard.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const rename = useRenameDashboard(dashboard.id)
  const setColumns = useSetColumns(dashboard.id)
  const remove = useDeleteDashboard(dashboard.id, dashboard.householdId)
  const error = rename.error ?? setColumns.error ?? remove.error

  function submitName(event: FormEvent) {
    event.preventDefault()
    rename.mutate(name, { onSuccess: () => onAnnounce(`Renamed to ${name}`) })
  }

  return (
    <section className={styles.panel} aria-labelledby="settings-heading">
      <h2 id="settings-heading">Dashboard settings</h2>
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
