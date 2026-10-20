import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { createQueryClient } from './app/queryClient.ts'
import { routes } from './app/routes.tsx'
import './styles/global.css'
import { ThemeProvider, bootTheme } from './theme/ThemeProvider.tsx'

// Before React renders, so the first paint already has the saved colors and no flash of the default.
bootTheme()

const queryClient = createQueryClient()
const router = createBrowserRouter(routes)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
