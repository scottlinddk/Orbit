import {
  createdInvitationSchema,
  invitationPreviewSchema,
  invitationSchema,
  sessionUserSchema,
} from '@orbit/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { useSignedIn } from './auth.ts'
import { request } from './client.ts'
import { keys } from './keys.ts'

const listSchema = z.object({ invitations: z.array(invitationSchema) })

/** Invitations of a household that can still be used. Owners only; the server answers 403 otherwise. */
export function useInvitations(householdId: string, enabled: boolean) {
  const signedIn = useSignedIn()
  return useQuery({
    enabled: signedIn && enabled,
    queryKey: keys.invitations(householdId),
    queryFn: async () =>
      (
        await request('GET', `/households/${encodeURIComponent(householdId)}/invitations`, {
          schema: listSchema,
        })
      ).invitations,
  })
}

/** The result carries the secret token. It exists only in this response, so keep it out of the cache. */
export function useCreateInvitation(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { role: 'owner' | 'member' }) =>
      request('POST', `/households/${encodeURIComponent(householdId)}/invitations`, {
        body: input,
        schema: createdInvitationSchema,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.invitations(householdId) }),
  })
}

export function useRevokeInvitation(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (invitationId: string) =>
      request(
        'DELETE',
        `/households/${encodeURIComponent(householdId)}/invitations/${encodeURIComponent(invitationId)}`,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.invitations(householdId) }),
  })
}

/** What an invitation link offers. A POST so the token stays out of the URL and the server log. */
export function useInvitationPreview(token: string) {
  return useQuery({
    enabled: token !== '',
    queryKey: keys.invitationPreview(token),
    queryFn: () =>
      request('POST', '/invitations/preview', { body: { token }, schema: invitationPreviewSchema }),
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  })
}

export function useAcceptInvitation() {
  return useMutation({
    mutationFn: (input: {
      token: string
      username: string
      password: string
      displayName?: string
    }) => request('POST', '/invitations/accept', { body: input, schema: sessionUserSchema }),
  })
}
