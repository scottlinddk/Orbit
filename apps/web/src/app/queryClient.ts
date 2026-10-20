import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client.ts'
import { keys } from '../api/keys.ts'

/**
 * Any 401 means the session ended (expired, or signed out elsewhere). Marking the user as
 * signed out sends them to the login page instead of leaving a half-working screen.
 */
export function createQueryClient(): QueryClient {
  const handle = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401 && queryClient.getQueryData(keys.me)) {
      queryClient.setQueryData(keys.me, null)
    }
  }
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: handle }),
    mutationCache: new MutationCache({ onError: handle }),
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
  })
  return queryClient
}
