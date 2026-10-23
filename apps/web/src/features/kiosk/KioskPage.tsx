import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useSyncExternalStore } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useDashboard } from '../../api/dashboards.ts'
import { Loading } from '../../components/Loading.tsx'
import { QueryError } from '../../components/QueryError.tsx'
import { useRegistry } from '../../widgets/useRegistry.ts'
import { CalendarDataProvider } from '../../widgets/CalendarDataProvider.tsx'
import { ListsHostProvider } from '../../widgets/ListsHostProvider.tsx'
import { MealsHostProvider } from '../../widgets/MealsHostProvider.tsx'
import { DashboardGrid } from '../dashboards/DashboardGrid.tsx'
import styles from './KioskPage.module.css'
import { SCALE_DEFAULT, loadScale, parseRefreshSeconds, parseScale, saveScale } from './settings.ts'
import { useIdle } from './useIdle.ts'
import { useWakeLock, type WakeLockState } from './useWakeLock.ts'

const IDLE_MS = 5000

const WAKE_HINTS: Record<Exclude<WakeLockState, 'active'>, string> = {
  insecure: 'The screen may turn off. Keeping it awake needs HTTPS.',
  unsupported:
    'This browser cannot keep the screen awake. Turn off screen sleep in the device settings.',
  failed: 'Could not keep the screen awake. Check the device power saving settings.',
}

function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}
const useOnline = () =>
  useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  )

/**
 * One dashboard, full screen, for a wall display. It uses the normal session and the normal
 * read API, so it can show nothing the signed-in account could not already see.
 * Settings in the address: `?refresh=<seconds>` (15 to 3600, default 60) and `?scale=<factor>`
 * (0.75 to 3). The scale is remembered on the device.
 */
export function KioskPage() {
  const { dashboardId = '' } = useParams()
  const [params] = useSearchParams()
  const dashboard = useDashboard(dashboardId)
  const registry = useRegistry()
  const queryClient = useQueryClient()
  const online = useOnline()
  const idle = useIdle(IDLE_MS)
  const wakeLock = useWakeLock()

  const refreshSeconds = parseRefreshSeconds(params.get('refresh'))
  const fromAddress = parseScale(params.get('scale'))
  const scale = fromAddress ?? loadScale() ?? SCALE_DEFAULT

  useEffect(() => {
    if (fromAddress !== null) saveScale(fromAddress)
  }, [fromAddress])

  // Everything in this page is rem based, so the root font size scales all of it.
  useEffect(() => {
    const root = document.documentElement
    root.style.fontSize = `${scale * 100}%`
    return () => {
      root.style.fontSize = ''
    }
  }, [scale])

  // Marks every active query stale, so the dashboard and each widget's own data reload. A 401
  // here also ends the session cleanly: the app then shows the sign-in page.
  useEffect(() => {
    const timer = setInterval(() => void queryClient.invalidateQueries(), refreshSeconds * 1000)
    return () => clearInterval(timer)
  }, [queryClient, refreshSeconds])

  if (dashboard.isPending) return <Loading />
  // With no data at all there is nothing to keep showing, so the error is the page.
  if (dashboard.isError && !dashboard.data) {
    return <QueryError error={dashboard.error} onRetry={() => void dashboard.refetch()} />
  }

  const data = dashboard.data!
  const reconnecting = !online || dashboard.isRefetchError

  return (
    <main
      className={`${styles.kiosk} ${idle ? styles.idle : ''}`}
      aria-label={`${data.name} wall display`}
    >
      <header className={styles.top}>
        <h1 className={styles.title}>{data.name}</h1>
        <Link className={styles.exit} to={`/d/${data.id}`}>
          Exit wall display
        </Link>
      </header>

      {data.widgets.length === 0 ? (
        <p className={styles.empty}>This dashboard has no widgets yet.</p>
      ) : (
        <ListsHostProvider householdId={data.householdId} readOnly>
          <MealsHostProvider
            householdId={data.householdId}
            enabled={data.widgets.some((w) => w.type.startsWith('meals.'))}
          >
            <CalendarDataProvider
              householdId={data.householdId}
              enabled={data.widgets.some((w) => w.type.startsWith('calendar.'))}
            >
              <DashboardGrid
                dashboard={data}
                registry={registry}
                editing={false}
                busy={false}
                selectedId={null}
                onSelect={() => {}}
                onMove={() => {}}
                onResize={() => {}}
                onRemove={() => {}}
              />
            </CalendarDataProvider>
          </MealsHostProvider>
        </ListsHostProvider>
      )}

      <div className={styles.status} role="status" aria-live="polite">
        {reconnecting ? <p>Reconnecting. Showing the last data.</p> : null}
        {wakeLock !== 'active' ? <p>{WAKE_HINTS[wakeLock]}</p> : null}
      </div>
    </main>
  )
}
