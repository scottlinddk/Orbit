import {
  createdNotificationEndpointSchema,
  deliverySchema,
  notificationEndpointSchema,
  type NotificationEventName,
} from '@orbit/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { useSignedIn } from './auth.ts'
import { request } from './client.ts'
import { keys } from './keys.ts'

const endpointsSchema = z.object({ endpoints: z.array(notificationEndpointSchema) })
const deliveriesSchema = z.object({ deliveries: z.array(deliverySchema) })
const enc = encodeURIComponent
const path = (householdId: string) => `/households/${enc(householdId)}/notifications/endpoints`

/** Webhooks of a household. Owners only; the server answers 403 to anyone else. */
export function useNotificationEndpoints(householdId: string, enabled = true) {
  const signedIn = useSignedIn()
  return useQuery({
    enabled: signedIn && enabled && householdId !== '',
    queryKey: keys.notificationEndpoints(householdId),
    queryFn: async () =>
      (await request('GET', path(householdId), { schema: endpointsSchema })).endpoints,
  })
}

/** The last deliveries of one webhook, newest first. Only fetched while the log is open. */
export function useDeliveries(householdId: string, endpointId: string, enabled: boolean) {
  const signedIn = useSignedIn()
  return useQuery({
    enabled: signedIn && enabled,
    queryKey: keys.notificationDeliveries(householdId, endpointId),
    queryFn: async () =>
      (
        await request('GET', `${path(householdId)}/${enc(endpointId)}/deliveries`, {
          schema: deliveriesSchema,
        })
      ).deliveries,
  })
}

/** The result carries the signing secret. It exists only in this response. */
export function useAddNotificationEndpoint(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      name: string
      url: string
      events: NotificationEventName[]
      leadMinutes?: number
    }) =>
      request('POST', path(householdId), {
        body: input,
        schema: createdNotificationEndpointSchema,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: keys.notificationEndpoints(householdId) }),
  })
}

export function useUpdateNotificationEndpoint(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...changes }: { id: string; enabled?: boolean }) =>
      request('PATCH', `${path(householdId)}/${enc(id)}`, {
        body: changes,
        schema: notificationEndpointSchema,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: keys.notificationEndpoints(householdId) }),
  })
}

export function useRemoveNotificationEndpoint(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => request('DELETE', `${path(householdId)}/${enc(id)}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: keys.notificationEndpoints(householdId) }),
  })
}

export function useSendTestNotification(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      request('POST', `${path(householdId)}/${enc(id)}/test`, { schema: deliverySchema }),
    onSuccess: (_entry, id) => {
      void queryClient.invalidateQueries({
        queryKey: keys.notificationDeliveries(householdId, id),
      })
      void queryClient.invalidateQueries({ queryKey: keys.notificationEndpoints(householdId) })
    },
  })
}
