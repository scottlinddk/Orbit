import type { RouteObject } from 'react-router'
import { LoginPage } from '../features/auth/LoginPage.tsx'
import { DashboardPage } from '../features/dashboards/DashboardPage.tsx'
import { HomePage } from '../features/households/HomePage.tsx'
import { HouseholdPage } from '../features/households/HouseholdPage.tsx'
import { AppShell } from './AppShell.tsx'
import { NotFoundPage } from './NotFoundPage.tsx'
import { RequireAuth } from './RequireAuth.tsx'

/** Kept separate from the router so tests can mount the same routes in a memory router. */
export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'h/:householdId', element: <HouseholdPage /> },
          { path: 'd/:dashboardId', element: <DashboardPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]
