import { sessionUserSchema, type SessionUser } from '@orbit/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, request } from './client.ts'
import { keys } from './keys.ts'

/** The signed-in user, or null when signed out. Signed out is a normal state, not an error. */
export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async (): Promise<SessionUser | null> => {
      try {
        return await request('GET', '/auth/me', { schema: sessionUserSchema })
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
    retry: false,
    staleTime: 60_000,
  })
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { username: string; password: string }) =>
      request('POST', '/auth/login', { body: input, schema: sessionUserSchema }),
    onSuccess: (user) => {
      queryClient.setQueryData(keys.me, user)
    },
  })
}

export function useRegister() {
  return useMutation({
    mutationFn: (input: { username: string; password: string; displayName?: string }) =>
      request('POST', '/auth/register', { body: input, schema: sessionUserSchema }),
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => request('POST', '/auth/logout', { body: {} }),
    onSettled: () => {
      // Drop everything cached for the previous person, success or not.
      queryClient.clear()
      queryClient.setQueryData(keys.me, null)
    },
  })
}
