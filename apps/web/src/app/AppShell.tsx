import { NavLink, Link, Outlet, useNavigate, useParams, useSearchParams } from 'react-router'
import { useAuthProviders, useLogout, useMe, useStartOidc } from '../api/auth.ts'
import { useDashboard } from '../api/dashboards.ts'
import { useHouseholds } from '../api/households.ts'
import { Alert } from '../components/Alert.tsx'
import { Button } from '../components/Button.tsx'
import { DashboardIcon, HomeIcon, HouseholdIcon, PaletteIcon } from '../components/icons.tsx'
import styles from './AppShell.module.css'

/** `Emma Larsen` becomes `EL`. Falls back to a dot so the avatar is never empty. */
export function initials(name: string | undefined): string {
  const letters = (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('')
  return letters || '•'
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="5" fill="currentColor" />
      <ellipse
        cx="16"
        cy="16"
        rx="13"
        ry="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        transform="rotate(-28 16 16)"
      />
    </svg>
  )
}

export function AppShell() {
  const me = useMe()
  const households = useHouseholds()
  const logout = useLogout()
  const navigate = useNavigate()
  const params = useParams()
  const providers = useAuthProviders()
  const startOidc = useStartOidc()
  const [search] = useSearchParams()
  // On a dashboard page the household comes from the (already cached) dashboard.
  const dashboard = useDashboard(params.dashboardId ?? '')
  const householdId = params.householdId ?? dashboard.data?.householdId
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `${styles.link} ${isActive ? styles.active : ''}`

  return (
    <>
      <a href="#main" className="visually-hidden">
        Skip to content
      </a>
      <header className={styles.header}>
        <div className={styles.bar}>
          <Link to="/" className={styles.brand} aria-label="Orbit home">
            <Logo />
            <span className={styles.brandName}>Orbit</span>
          </Link>

          <nav aria-label="Main" className={styles.nav}>
            <NavLink to="/" end className={linkClass}>
              <HomeIcon />
              <span className={styles.label}>Home</span>
            </NavLink>
            {householdId ? (
              <NavLink to={`/h/${householdId}`} className={linkClass}>
                <HouseholdIcon />
                <span className={styles.label}>Household</span>
              </NavLink>
            ) : null}
            {params.dashboardId && dashboard.data ? (
              <NavLink to={`/d/${params.dashboardId}`} className={linkClass}>
                <DashboardIcon />
                <span className={styles.label}>{dashboard.data.name}</span>
              </NavLink>
            ) : null}
            <NavLink to="/appearance" className={linkClass}>
              <PaletteIcon />
              <span className={styles.label}>Appearance</span>
            </NavLink>
          </nav>

          <div className={styles.account}>
            {households.data && households.data.length > 0 ? (
              <>
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
                  {householdId ? null : <option value="">Household…</option>}
                  {households.data.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            <span className={styles.avatar} role="img" aria-label={me.data?.displayName ?? 'You'}>
              {initials(me.data?.displayName)}
            </span>
            {providers.oidc ? (
              <Button busy={startOidc.isPending} onClick={() => startOidc.mutate({ link: true })}>
                Link {providers.oidc.label}
              </Button>
            ) : null}
            <Button
              busy={logout.isPending}
              onClick={() => logout.mutate(undefined, { onSettled: () => void navigate('/login') })}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main id="main" className={styles.main}>
        {search.get('oidc') === 'linked' ? (
          <Alert tone="info">
            Your {providers.oidc?.label ?? 'identity provider'} account is linked. You can use it to
            sign in.
          </Alert>
        ) : null}
        {startOidc.error ? <Alert>{startOidc.error.message}</Alert> : null}
        <Outlet />
      </main>
    </>
  )
}
