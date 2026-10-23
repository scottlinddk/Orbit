import { useState, type FormEvent, type MouseEvent } from 'react'
import { Navigate, useLocation, useSearchParams } from 'react-router'
import {
  useAuthProviders,
  useLogin,
  useMe,
  useRegister,
  useSetupStatus,
  useStartOidc,
} from '../../api/auth.ts'
import { ApiError } from '../../api/client.ts'
import { Alert } from '../../components/Alert.tsx'
import { Button } from '../../components/Button.tsx'
import { Loading } from '../../components/Loading.tsx'
import { TextField } from '../../components/TextField.tsx'
import { HeroIllustration } from './HeroIllustration.tsx'
import styles from './LoginPage.module.css'

type Mode = 'sign-in' | 'create'

/** Only same-site paths are accepted as a return address, never "//host" or full URLs. */
export function safeReturnPath(value: unknown): string {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : '/'
}

/** What the callback leaves in `?oidc=` when single sign-on did not work. Short codes, never provider text. */
const OIDC_MESSAGES: Record<string, string> = {
  expired: 'The sign-in took too long or was opened in another browser. Please try again.',
  denied: 'The identity provider did not let you in.',
  failed: 'Signing in with the identity provider did not work. Please try again.',
  closed:
    'This Orbit does not create accounts for new people. Ask an owner for an invitation, or sign in with an account that already exists.',
  'setup-code': 'The setup code is missing or wrong. Find it in the server log.',
  invite: 'That invitation no longer works. Ask the person who invited you for a new one.',
  taken: 'That identity provider account is already linked to a different Orbit account.',
}

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('sign-in')
  const me = useMe()
  const login = useLogin()
  const register = useRegister()
  const setup = useSetupStatus(mode === 'create')
  const location = useLocation()
  const providers = useAuthProviders()
  const startOidc = useStartOidc()
  const [search] = useSearchParams()
  const oidcMessage = OIDC_MESSAGES[search.get('oidc') ?? '']
  // Without a password form, the setup code (first account on a new instance) goes with the button.
  const setupForOidc = useSetupStatus(!providers.local)

  if (me.isPending) return <Loading />
  if (me.data)
    return (
      <Navigate to={safeReturnPath((location.state as { from?: unknown } | null)?.from)} replace />
    )

  const creating = mode === 'create'
  // Also shown when the server asks for it, in case the status call failed.
  const needsSetupCode =
    setup.data?.setupCodeRequired === true ||
    (register.error instanceof ApiError &&
      register.error.problem?.type === 'urn:orbit:problem:setup-code-invalid')
  const error = register.error ?? login.error ?? startOidc.error
  const busy = login.isPending || register.isPending

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const username = String(form.get('username') ?? '')
    const password = String(form.get('password') ?? '')
    const displayName = String(form.get('displayName') ?? '').trim()
    const setupCode = String(form.get('setupCode') ?? '').trim()
    login.reset()
    register.reset()
    try {
      if (creating) {
        await register.mutateAsync({
          username,
          password,
          ...(displayName ? { displayName } : {}),
          ...(needsSetupCode && setupCode ? { setupCode } : {}),
        })
      }
      await login.mutateAsync({ username, password })
    } catch {
      // The mutations hold the error and the alert below shows it.
    }
  }

  function startSso(event: MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form
    const setupCode = String(new FormData(form ?? undefined).get('setupCode') ?? '').trim()
    startOidc.mutate(setupCode ? { setupCode } : {})
  }
  const ssoButton = providers.oidc ? (
    <Button
      variant={providers.local ? 'secondary' : 'primary'}
      busy={startOidc.isPending}
      onClick={startSso}
    >
      Sign in with {providers.oidc.label}
    </Button>
  ) : null

  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-label="About Orbit">
        <HeroIllustration className={styles.art} />
        <p className={styles.heroTitle}>Modern tools for modern households</p>
        <p className={styles.heroText}>
          Shared dashboards for the people you live with. Self-hosted, and yours.
        </p>
      </section>
      <form className={styles.card} onSubmit={(event) => void submit(event)}>
        <h1>{creating && providers.local ? 'Create your account' : 'Sign in to Orbit'}</h1>
        {oidcMessage ? <Alert>{oidcMessage}</Alert> : null}
        {error ? <Alert>{error.message}</Alert> : null}
        {providers.local ? (
          <>
            {creating ? (
              <p className={styles.note}>
                The first account on a new Orbit becomes its owner. Later accounts are added by the
                owner.
              </p>
            ) : null}
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
            {creating && needsSetupCode ? (
              <TextField
                label="Setup code"
                name="setupCode"
                autoComplete="off"
                required
                autoCapitalize="characters"
                spellCheck={false}
                hint="Printed in the server log when Orbit started. With Docker: docker compose logs orbit"
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
            {ssoButton}
            <Button
              onClick={() => {
                login.reset()
                register.reset()
                setMode(creating ? 'sign-in' : 'create')
              }}
            >
              {creating ? 'I already have an account' : 'Create the first account'}
            </Button>
          </>
        ) : (
          <>
            {setupForOidc.data?.setupCodeRequired ? (
              <TextField
                label="Setup code (first account only)"
                name="setupCode"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                hint="Printed in the server log when Orbit started. With Docker: docker compose logs orbit"
              />
            ) : null}
            {ssoButton}
          </>
        )}
      </form>
    </main>
  )
}
