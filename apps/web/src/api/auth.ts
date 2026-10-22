import {
  authProvidersSchema,
  oidcStartResponseSchema,
  sessionUserSchema,
  setupStatusSchema,
  type AuthProviders,
  type SessionUser,
} from '@orbit/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, request } from './client.ts'
import { keys } from './keys.ts'
import { goTo } from './navigate.ts'

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

/**
 * Whether a user is signed in right now. Data queries wait for it, so signing out cannot make
 * the screens behind the login page fire one last request that is bound to fail with 401.
 */
export function useSignedIn(): boolean {
  return useMe().data != null
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

/** Whether creating the first account needs the setup code from the server log. */
export function useSetupStatus(enabled: boolean) {
  return useQuery({
    queryKey: keys.setup,
    queryFn: () => request('GET', '/auth/setup', { schema: setupStatusSchema }),
    enabled,
    retry: false,
    staleTime: 0,
  })
}

const PASSWORDS_ONLY: AuthProviders = { local: true, oidc: null }

/**
 * How people can sign in here. If the call fails the page falls back to the password form, which
 * is what an instance without single sign-on offers.
 */
export function useAuthProviders(): AuthProviders {
  const query = useQuery({
    queryKey: keys.providers,
    queryFn: () => request('GET', '/auth/providers', { schema: authProvidersSchema }),
    retry: false,
    staleTime: 60_000,
  })
  return query.data ?? PASSWORDS_ONLY
}

/** Only follow an address the server gave us if it is a web address. */
export function isWebAddress(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

/**
 * Asks the server to start a sign-in at the identity provider, then sends the browser there. The
 * invitation token and setup code travel in the request body, never in a URL.
 */
export function useStartOidc() {
  return useMutation({
    mutationFn: async (input: { inviteToken?: string; setupCode?: string; link?: boolean }) => {
      const { authorizationUrl } = await request('POST', '/auth/oidc/start', {
        body: input,
        schema: oidcStartResponseSchema,
      })
      if (!isWebAddress(authorizationUrl)) {
        throw new ApiError(0, 'The server sent an address this app will not open.')
      }
      goTo(authorizationUrl)
    },
  })
}

export function useRegister() {
  return useMutation({
    mutationFn: (input: {
      username: string
      password: string
      displayName?: string
      setupCode?: string
    }) => request('POST', '/auth/register', { body: input, schema: sessionUserSchema }),
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
