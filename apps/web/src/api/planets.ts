import { planetRenderSchema, planetWidgetSchema } from '@orbit/contracts'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { useSignedIn } from './auth.ts'
import { request } from './client.ts'
import { keys } from './keys.ts'

const listSchema = z.object({ widgets: z.array(planetWidgetSchema) })
const enc = encodeURIComponent
const FIVE_MINUTES = 5 * 60 * 1000
const ONE_MINUTE = 60 * 1000

/** Widgets added by installed Planets. They change only when an administrator installs one. */
export function usePlanetWidgets() {
  const signedIn = useSignedIn()
  return useQuery({
    enabled: signedIn,
    queryKey: keys.planetWidgets,
    queryFn: async () => (await request('GET', '/planets/widgets', { schema: listSchema })).widgets,
    staleTime: FIVE_MINUTES,
    retry: false,
  })
}

/** The server renders from the last good data, so polling once a minute is cheap. */
export function usePlanetRender(dashboardId: string, widgetId: string) {
  return useQuery({
    queryKey: keys.planetRender(dashboardId, widgetId),
    queryFn: () =>
      request('GET', `/dashboards/${enc(dashboardId)}/widgets/${enc(widgetId)}/planet`, {
        schema: planetRenderSchema,
      }),
    enabled: dashboardId !== '' && widgetId !== '',
    refetchInterval: ONE_MINUTE,
    retry: false,
  })
}
