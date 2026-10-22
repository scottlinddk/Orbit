import { useContext } from 'react'
import { useParams } from 'react-router'
import { usePlanetRender } from '../api/planets.ts'
import { Loading } from '../components/Loading.tsx'
import { PlacementIdContext } from './placementContext.ts'
import styles from './PlanetWidget.module.css'

/**
 * Shows the output of a Planet template. The markup comes from a third party, so it is drawn in
 * a sandboxed frame with no scripts and an opaque origin: it cannot read the page, the session
 * or other widgets, whatever the template contains. The server has already escaped all data.
 */
export function PlanetWidget({ title }: { title: string }) {
  const { dashboardId = '' } = useParams()
  const widgetId = useContext(PlacementIdContext) ?? ''
  const render = usePlanetRender(dashboardId, widgetId)

  if (render.isPending) return <Loading />
  if (render.isError) return <p role="alert">This Planet could not be shown.</p>
  const { html, stale, error } = render.data
  return (
    <>
      {error ? (
        <p className={styles.note} role={stale ? 'status' : 'alert'}>
          {stale ? `Showing older data. ${error}` : error}
        </p>
      ) : null}
      <iframe
        className={styles.frame}
        title={title}
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={`<!doctype html><meta charset="utf-8"><meta name="color-scheme" content="light dark"><base target="_blank">${html}`}
      />
    </>
  )
}
