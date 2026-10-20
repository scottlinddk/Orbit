import { dashboardSchema, type DashboardResponse } from '@orbit/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { useSignedIn } from './auth.ts'
import { request } from './client.ts'
import { keys } from './keys.ts'

const listSchema = z.object({ dashboards: z.array(dashboardSchema) })
const enc = encodeURIComponent

export function useDashboards(householdId: string) {
  const signedIn = useSignedIn()
  return useQuery({
    enabled: signedIn,
    queryKey: keys.dashboards(householdId),
    queryFn: async () =>
      (await request('GET', `/households/${enc(householdId)}/dashboards`, { schema: listSchema }))
        .dashboards,
    retry: false,
  })
}

export function useDashboard(id: string) {
  const signedIn = useSignedIn()
  return useQuery({
    queryKey: keys.dashboard(id),
    queryFn: () => request('GET', `/dashboards/${enc(id)}`, { schema: dashboardSchema }),
    enabled: signedIn && id !== '',
    retry: false,
  })
}

/** Puts the server's version of a dashboard into the cache and refreshes the household's list. */
function useCacheDashboard() {
  const queryClient = useQueryClient()
  return (dashboard: DashboardResponse) => {
    queryClient.setQueryData(keys.dashboard(dashboard.id), dashboard)
    void queryClient.invalidateQueries({ queryKey: keys.dashboards(dashboard.householdId) })
  }
}

export function useCreateDashboard(householdId: string) {
  const cache = useCacheDashboard()
  return useMutation({
    mutationFn: (input: { name: string }) =>
      request('POST', `/households/${enc(householdId)}/dashboards`, {
        body: input,
        schema: dashboardSchema,
      }),
    onSuccess: cache,
  })
}

export function useRenameDashboard(id: string) {
  const cache = useCacheDashboard()
  return useMutation({
    mutationFn: (name: string) =>
      request('PUT', `/dashboards/${enc(id)}/name`, { body: { name }, schema: dashboardSchema }),
    onSuccess: cache,
  })
}

export function useSetColumns(id: string) {
  const cache = useCacheDashboard()
  return useMutation({
    mutationFn: (columns: 1 | 2 | 3 | 4) =>
      request('PUT', `/dashboards/${enc(id)}/columns`, {
        body: { columns },
        schema: dashboardSchema,
      }),
    onSuccess: cache,
  })
}

export function useAddWidget(id: string) {
  const cache = useCacheDashboard()
  return useMutation({
    mutationFn: (input: { type: string; span: number }) =>
      request('POST', `/dashboards/${enc(id)}/widgets`, { body: input, schema: dashboardSchema }),
    onSuccess: cache,
  })
}

export function useRemoveWidget(id: string) {
  const cache = useCacheDashboard()
  return useMutation({
    mutationFn: (widgetId: string) =>
      request('DELETE', `/dashboards/${enc(id)}/widgets/${enc(widgetId)}`, {
        schema: dashboardSchema,
      }),
    onSuccess: cache,
  })
}

/** The same order the server produces: the widget ends up at `toIndex` in the resulting list. */
export function moveInList<T extends { id: string }>(
  widgets: readonly T[],
  widgetId: string,
  toIndex: number,
): T[] {
  const from = widgets.findIndex((w) => w.id === widgetId)
  if (from === -1) return [...widgets]
  const next = [...widgets]
  const [moved] = next.splice(from, 1)
  next.splice(toIndex, 0, moved!)
  return next
}

export function useMoveWidget(id: string) {
  const cache = useCacheDashboard()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { widgetId: string; toIndex: number }) =>
      request('PUT', `/dashboards/${enc(id)}/widgets/${enc(input.widgetId)}/position`, {
        body: { toIndex: input.toIndex },
        schema: dashboardSchema,
      }),
    // Show the new order at once, so a dropped card does not jump back while the request runs.
    onMutate: async ({ widgetId, toIndex }) => {
      await queryClient.cancelQueries({ queryKey: keys.dashboard(id) })
      const previous = queryClient.getQueryData<DashboardResponse>(keys.dashboard(id))
      if (previous) {
        queryClient.setQueryData<DashboardResponse>(keys.dashboard(id), {
          ...previous,
          widgets: moveInList(previous.widgets, widgetId, toIndex),
        })
      }
      return { previous }
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(keys.dashboard(id), context.previous)
    },
    onSuccess: cache,
  })
}

export function useResizeWidget(id: string) {
  const cache = useCacheDashboard()
  return useMutation({
    mutationFn: (input: { widgetId: string; span: number }) =>
      request('PUT', `/dashboards/${enc(id)}/widgets/${enc(input.widgetId)}/span`, {
        body: { span: input.span },
        schema: dashboardSchema,
      }),
    onSuccess: cache,
  })
}

export function useConfigureWidget(id: string) {
  const cache = useCacheDashboard()
  return useMutation({
    mutationFn: (input: { widgetId: string; config: Record<string, unknown> }) =>
      request('PUT', `/dashboards/${enc(id)}/widgets/${enc(input.widgetId)}/config`, {
        body: { config: input.config },
        schema: dashboardSchema,
      }),
    onSuccess: cache,
  })
}

export function useDeleteDashboard(id: string, householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => request('DELETE', `/dashboards/${enc(id)}`),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: keys.dashboard(id) })
      void queryClient.invalidateQueries({ queryKey: keys.dashboards(householdId) })
    },
  })
}
