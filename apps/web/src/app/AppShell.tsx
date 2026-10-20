import { Link, Outlet, useNavigate, useParams } from 'react-router'
import { useLogout, useMe } from '../api/auth.ts'
import { useDashboard } from '../api/dashboards.ts'
import { useHouseholds } from '../api/households.ts'
import { Button } from '../components/Button.tsx'
import styles from './AppShell.module.css'

export function AppShell() {
  const me = useMe()
  const households = useHouseholds()
  const logout = useLogout()
  const navigate = useNavigate()
  const params = useParams()
  // On a dashboard page the household comes from the (already cached) dashboard.
  const dashboard = useDashboard(params.dashboardId ?? '')
  const householdId = params.householdId ?? dashboard.data?.householdId

  return (
    <>
      <a href="#main" className="visually-hidden">
        Skip to content
      </a>
      <header className={styles.header}>
        <div className={styles.bar}>
          <Link to="/" className={styles.brand}>
            Orbit
          </Link>
          {households.data && households.data.length > 0 ? (
            <div className={styles.switcher}>
              <label htmlFor="household-switcher" className="visually-hidden">
                Household
              </label>
              <select
                id="household-switcher"
                className={styles.select}
                value={householdId ?? ''}
                onChange={(event) => {
                  if (event.target.value) void navigate(`/h/${event.target.value}`)
                }}
              >
                {householdId ? null : <option value="">Choose a household</option>}
                {households.data.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <span className={styles.spacer} />
          <span className={styles.user}>{me.data?.displayName}</span>
          <Button
            busy={logout.isPending}
            onClick={() => logout.mutate(undefined, { onSettled: () => void navigate('/login') })}
          >
            Sign out
          </Button>
        </div>
      </header>
      <main id="main" className={styles.main}>
        <Outlet />
      </main>
    </>
  )
}
