import '@testing-library/jest-dom/vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, configure, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach } from 'vitest'
import { createQueryClient } from '../app/queryClient.ts'
import { routes } from '../app/routes.tsx'

// The default 1s is too tight when many test files compete for a small CI runner, because the
// first test of a file also pays for loading the whole app. A slow machine is not a bug.
configure({ asyncUtilTimeout: 5000 })

afterEach(cleanup)

/** Mounts the real route table at `path`, with a fresh query cache. */
export function renderApp(path: string) {
  const queryClient = createQueryClient()
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ...view, router, queryClient, user: userEvent.setup() }
}
