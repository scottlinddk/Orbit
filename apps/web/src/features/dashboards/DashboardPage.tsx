import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useMe } from '../../api/auth.ts'
import { useDashboard, useMoveWidget, useRemoveWidget } from '../../api/dashboards.ts'
import { useHousehold } from '../../api/households.ts'
import { Alert } from '../../components/Alert.tsx'
import { Button } from '../../components/Button.tsx'
import { Loading } from '../../components/Loading.tsx'
import { QueryError } from '../../components/QueryError.tsx'
import { registry } from '../../widgets/registry.ts'
import { DashboardGrid } from './DashboardGrid.tsx'
import { EditPanel } from './EditPanel.tsx'

export function DashboardPage() {
  const { dashboardId = '' } = useParams()
  const me = useMe()
  const dashboard = useDashboard(dashboardId)
  const household = useHousehold(dashboard.data?.householdId ?? '')
  const move = useMoveWidget(dashboardId)
  const remove = useRemoveWidget(dashboardId)
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [announcement, setAnnouncement] = useState('')

  if (dashboard.isPending) return <Loading />
  if (dashboard.isError)
    return <QueryError error={dashboard.error} onRetry={() => void dashboard.refetch()} />

  const data = dashboard.data
  const meId = me.data?.id
  const isOwner =
    household.data?.members.some((m) => m.userId === meId && m.role === 'owner') ?? false
  const error = move.error ?? remove.error

  const titleOf = (widgetId: string) => {
    const placement = data.widgets.find((w) => w.id === widgetId)
    return (placement && registry.find(placement.type)?.title) ?? 'widget'
  }

  return (
    <>
      <p>
        <Link to={`/h/${data.householdId}`}>← Household</Link>
      </p>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}
      >
        <h1 style={{ margin: 0 }}>{data.name}</h1>
        {isOwner ? (
          <Button aria-pressed={editing} onClick={() => setEditing((value) => !value)}>
            {editing ? 'Done' : 'Edit'}
          </Button>
        ) : null}
      </div>

      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>

      {error ? <Alert>{error.message}</Alert> : null}

      {editing && isOwner ? (
        <EditPanel
          dashboard={data}
          registry={registry}
          onAnnounce={setAnnouncement}
          onDeleted={() => void navigate(`/h/${data.householdId}`)}
        />
      ) : null}

      {data.widgets.length === 0 ? (
        <p>
          {isOwner
            ? 'This dashboard is empty. Choose Edit, then add a widget.'
            : 'Nothing here yet. An owner can add widgets.'}
        </p>
      ) : (
        <DashboardGrid
          dashboard={data}
          registry={registry}
          editing={editing && isOwner}
          busy={move.isPending || remove.isPending}
          onMove={(widgetId, toIndex) =>
            move.mutate(
              { widgetId, toIndex },
              {
                onSuccess: () =>
                  setAnnouncement(
                    `Moved ${titleOf(widgetId)} to position ${toIndex + 1} of ${data.widgets.length}`,
                  ),
              },
            )
          }
          onRemove={(widgetId) => {
            const title = titleOf(widgetId)
            remove.mutate(widgetId, { onSuccess: () => setAnnouncement(`Removed ${title}`) })
          }}
        />
      )}
    </>
  )
}
