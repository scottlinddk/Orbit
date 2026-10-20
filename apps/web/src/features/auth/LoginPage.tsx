import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useLogin, useMe, useRegister } from '../../api/auth.ts'
import { Alert } from '../../components/Alert.tsx'
import { Button } from '../../components/Button.tsx'
import { Loading } from '../../components/Loading.tsx'
import { TextField } from '../../components/TextField.tsx'
import styles from './LoginPage.module.css'

type Mode = 'sign-in' | 'create'

/** Only same-site paths are accepted as a return address, never "//host" or full URLs. */
export function safeReturnPath(value: unknown): string {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : '/'
}

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('sign-in')
  const me = useMe()
  const login = useLogin()
  const register = useRegister()
  const location = useLocation()

  if (me.isPending) return <Loading />
  if (me.data)
    return (
      <Navigate to={safeReturnPath((location.state as { from?: unknown } | null)?.from)} replace />
    )

  const creating = mode === 'create'
  const error = register.error ?? login.error
  const busy = login.isPending || register.isPending

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const username = String(form.get('username') ?? '')
    const password = String(form.get('password') ?? '')
    const displayName = String(form.get('displayName') ?? '').trim()
    login.reset()
    register.reset()
    try {
      if (creating) {
        await register.mutateAsync({ username, password, ...(displayName ? { displayName } : {}) })
      }
      await login.mutateAsync({ username, password })
    } catch {
      // The mutations hold the error and the alert below shows it.
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-label="About Orbit">
        <p className={styles.heroTitle}>Modern tools for modern households</p>
        <p className={styles.heroText}>
          Shared dashboards for the people you live with. Self-hosted, and yours.
        </p>
      </section>
      <form className={styles.card} onSubmit={(event) => void submit(event)}>
        <h1>{creating ? 'Create your account' : 'Sign in to Orbit'}</h1>
        {creating ? (
          <p className={styles.note}>
            The first account on a new Orbit becomes its owner. Later accounts are added by the
            owner.
          </p>
        ) : null}
        {error ? <Alert>{error.message}</Alert> : null}
        <TextField
          label="Username"
          name="username"
          autoComplete="username"
          required
          autoCapitalize="none"
          spellCheck={false}
        />
        {creating ? (
          <TextField
            label="Display name (optional)"
            name="displayName"
            autoComplete="name"
            maxLength={80}
          />
        ) : null}
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete={creating ? 'new-password' : 'current-password'}
          required
          {...(creating
            ? { minLength: 12, hint: 'At least 12 characters. A few random words work well.' }
            : {})}
        />
        <Button type="submit" variant="primary" busy={busy}>
          {creating ? 'Create account' : 'Sign in'}
        </Button>
        <Button
          onClick={() => {
            login.reset()
            register.reset()
            setMode(creating ? 'sign-in' : 'create')
          }}
        >
          {creating ? 'I already have an account' : 'Create the first account'}
        </Button>
      </form>
    </main>
  )
}
