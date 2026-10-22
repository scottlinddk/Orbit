import { calendarEventsSchema, calendarSourceSchema } from '@orbit/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { useSignedIn } from './auth.ts'
import { request } from './client.ts'
import { keys } from './keys.ts'

const sourcesSchema = z.object({ sources: z.array(calendarSourceSchema) })
const enc = encodeURIComponent
const MINUTE = 60 * 1000

/** Calendars of a household. Members may read the list; only owners may change it. */
export function useCalendarSources(householdId: string, enabled = true) {
  const signedIn = useSignedIn()
  return useQuery({
    enabled: signedIn && enabled && householdId !== '',
    queryKey: keys.calendarSources(householdId),
    queryFn: async () =>
      (
        await request('GET', `/households/${enc(householdId)}/calendar/sources`, {
          schema: sourcesSchema,
        })
      ).sources,
  })
}

/**
 * The next week of events from all calendars. The server reads each calendar at most every five
 * minutes, so asking once a minute only re-reads what it already has.
 */
export function useCalendarEvents(householdId: string, enabled: boolean) {
  const signedIn = useSignedIn()
  return useQuery({
    enabled: signedIn && enabled && householdId !== '',
    queryKey: keys.calendarEvents(householdId),
    queryFn: () =>
      request('GET', `/households/${enc(householdId)}/calendar/events`, {
        schema: calendarEventsSchema,
      }),
    refetchInterval: MINUTE,
    retry: false,
  })
}

export function useAddCalendarSource(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; url: string; color?: string }) =>
      request('POST', `/households/${enc(householdId)}/calendar/sources`, {
        body: input,
        schema: calendarSourceSchema,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.calendarSources(householdId) })
      void queryClient.invalidateQueries({ queryKey: keys.calendarEvents(householdId) })
    },
  })
}

export function useRemoveCalendarSource(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sourceId: string) =>
      request('DELETE', `/households/${enc(householdId)}/calendar/sources/${enc(sourceId)}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.calendarSources(householdId) })
      void queryClient.invalidateQueries({ queryKey: keys.calendarEvents(householdId) })
    },
  })
}
