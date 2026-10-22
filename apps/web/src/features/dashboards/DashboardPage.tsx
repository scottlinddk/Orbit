import { lazy, Suspense, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useMe } from '../../api/auth.ts'
import {
  useConfigureWidget,
  useDashboard,
  useMoveWidget,
  useRemoveWidget,
  useResizeWidget,
} from '../../api/dashboards.ts'
import { useHousehold } from '../../api/households.ts'
import { Alert } from '../../components/Alert.tsx'
import { Button } from '../../components/Button.tsx'
import { CheckIcon, PencilIcon } from '../../components/icons.tsx'
import { Loading } from '../../components/Loading.tsx'
import { PageHeader } from '../../components/PageHeader.tsx'
import { QueryError } from '../../components/QueryError.tsx'
import { useRegistry } from '../../widgets/useRegistry.ts'
import { DashboardGrid } from './DashboardGrid.tsx'
import styles from './DashboardPage.module.css'

const EditorSidebar = lazy(() => import('./EditorSidebar.tsx'))

export function DashboardPage() {
  const { dashboardId = '' } = useParams()
  const me = useMe()
  const dashboard = useDashboard(dashboardId)
  const household = useHousehold(dashboard.data?.householdId ?? '')
  const move = useMoveWidget(dashboardId)
  const resize = useResizeWidget(dashboardId)
  const configure = useConfigureWidget(dashboardId)
  const remove = useRemoveWidget(dashboardId)
  const navigate = useNavigate()
  const registry = useRegistry()
  const [editing, setEditing] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')

  if (dashboard.isPending) return <Loading />
  if (dashboard.isError)
    return <QueryError error={dashboard.error} onRetry={() => void dashboard.refetch()} />

  const data = dashboard.data
  const meId = me.data?.id
  const isOwner =
    household.data?.members.some((m) => m.userId === meId && m.role === 'owner') ?? false
  const isEditing = editing && isOwner
  const error = move.error ?? resize.error ?? configure.error ?? remove.error
  const busy = move.isPending || resize.isPending || configure.isPending || remove.isPending

  const titleOf = (widgetId: string) => {
    const placement = data.widgets.find((w) => w.id === widgetId)
    return (placement && registry.find(placement.type)?.title) ?? 'widget'
  }
  const selectedIndex = data.widgets.findIndex((w) => w.id === selectedId)
  const selected = selectedIndex === -1 ? undefined : data.widgets[selectedIndex]

  const onMove = (widgetId: string, toIndex: number) =>
    move.mutate(
      { widgetId, toIndex },
      {
        onSuccess: () =>
          setAnnouncement(
            `Moved ${titleOf(widgetId)} to position ${toIndex + 1} of ${data.widgets.length}`,
          ),
      },
    )

  const onResize = (widgetId: string, span: number) =>
    resize.mutate(
      { widgetId, span },
      {
        onSuccess: () =>
          setAnnouncement(
            `${titleOf(widgetId)} is now ${span} ${span === 1 ? 'column' : 'columns'} wide`,
          ),
      },
    )

  const onRemove = (widgetId: string) => {
    const title = titleOf(widgetId)
    remove.mutate(widgetId, {
      onSuccess: () => {
        setAnnouncement(`Removed ${title}`)
        setSelectedId((current) => (current === widgetId ? null : current))
      },
    })
  }

  const greeting = me.data ? `Welcome back, ${me.data.displayName}` : 'Welcome back'

  return (
    <>
      <p className={styles.back}>
        <Link to={`/h/${data.householdId}`}>← Household</Link>
      </p>
      <PageHeader
        eyebrow={`${greeting}. Take control of your household with real-time insights`}
        title={data.name}
        actions={
          isOwner ? (
            <Button
              variant="primary"
              className={styles.cta}
              aria-pressed={editing}
              onClick={() => {
                setEditing((value) => !value)
                setSelectedId(null)
              }}
            >
              {editing ? <CheckIcon /> : <PencilIcon />}
              {editing ? 'Done' : 'Edit layout'}
            </Button>
          ) : null
        }
      />

      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>

      {error ? <Alert>{error.message}</Alert> : null}

      <div className={isEditing ? styles.editLayout : undefined}>
        <div className={styles.main}>
          {data.widgets.length === 0 ? (
            <p>
              {isOwner
                ? 'This dashboard is empty. Choose Edit layout, then add a widget.'
                : 'Nothing here yet. An owner can add widgets.'}
            </p>
          ) : (
            <DashboardGrid
              dashboard={data}
              registry={registry}
              editing={isEditing}
              busy={busy}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onMove={onMove}
              onResize={onResize}
              onRemove={onRemove}
            />
          )}
        </div>

        {isEditing ? (
          <aside className={styles.sidebar} aria-label="Editor">
            <Suspense fallback={<Loading label="Loading the editor" />}>
              <EditorSidebar
                dashboard={data}
                registry={registry}
                selected={selected}
                selectedIndex={selectedIndex}
                busy={busy}
                onResize={onResize}
                onMove={onMove}
                onConfig={(widgetId, config) =>
                  configure.mutate(
                    { widgetId, config },
                    { onSuccess: () => setAnnouncement(`Updated ${titleOf(widgetId)} settings`) },
                  )
                }
                onRemove={onRemove}
                onClose={() => setSelectedId(null)}
                onAnnounce={setAnnouncement}
                onDeleted={() => void navigate(`/h/${data.householdId}`)}
              />
            </Suspense>
          </aside>
        ) : null}
      </div>
    </>
  )
}
