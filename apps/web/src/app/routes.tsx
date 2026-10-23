import type { RouteObject } from 'react-router'
import { JoinPage } from '../features/auth/JoinPage.tsx'
import { LoginPage } from '../features/auth/LoginPage.tsx'
import { DashboardPage } from '../features/dashboards/DashboardPage.tsx'
import { KioskPage } from '../features/kiosk/KioskPage.tsx'
import { HomePage } from '../features/households/HomePage.tsx'
import { HouseholdPage } from '../features/households/HouseholdPage.tsx'
import { AppShell } from './AppShell.tsx'
import { NotFoundPage } from './NotFoundPage.tsx'
import { RequireAuth } from './RequireAuth.tsx'

/** Kept separate from the router so tests can mount the same routes in a memory router. */
export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/join', element: <JoinPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        // The wall display has no navigation chrome, so it sits outside the app shell.
        path: 'kiosk/:dashboardId',
        element: <KioskPage />,
      },
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'h/:householdId', element: <HouseholdPage /> },
          { path: 'd/:dashboardId', element: <DashboardPage /> },
          // Rarely opened, and it brings the font catalog and every editor control with it.
          {
            path: 'appearance',
            lazy: async () => ({
              Component: (await import('../theme/editor/ThemePage.tsx')).ThemePage,
            }),
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]
