import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { useAuthProviders, useLogin, useMe, useStartOidc } from '../../api/auth.ts'
import { useAcceptInvitation, useInvitationPreview } from '../../api/invitations.ts'
import { Alert } from '../../components/Alert.tsx'
import { Button } from '../../components/Button.tsx'
import { Loading } from '../../components/Loading.tsx'
import { TextField } from '../../components/TextField.tsx'
import { HeroIllustration } from './HeroIllustration.tsx'
import styles from './LoginPage.module.css'

/** Invitation links look like /join#<token>. A fragment never reaches the server or its logs. */
export function tokenFromHash(hash: string): string {
  const raw = hash.replace(/^#/, '')
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export function JoinPage() {
  const { hash } = useLocation()
  const token = tokenFromHash(hash)
  const me = useMe()
  const preview = useInvitationPreview(token)
  const accept = useAcceptInvitation()
  const login = useLogin()
  const providers = useAuthProviders()
  const startOidc = useStartOidc()
  const [done, setDone] = useState(false)

  if (done && me.data) return <Navigate to="/" replace />
  if (me.isPending || (token !== '' && preview.isPending)) return <Loading />

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const username = String(form.get('username') ?? '')
    const password = String(form.get('password') ?? '')
    const displayName = String(form.get('displayName') ?? '').trim()
    accept.reset()
    login.reset()
    try {
      await accept.mutateAsync({
        token,
        username,
        password,
        ...(displayName ? { displayName } : {}),
      })
      await login.mutateAsync({ username, password })
      setDone(true)
    } catch {
      // The mutations hold the error and the alert below shows it.
    }
  }

  const error = accept.error ?? login.error ?? startOidc.error
  let body
  let offersForm = false
  if (me.data) {
    body = (
      <>
        <h1>You are already signed in</h1>
        <p className={styles.note}>
          You are signed in as {me.data.displayName}. Sign out first to use this invitation for a
          new account.
        </p>
        <Link to="/">Back to Orbit</Link>
      </>
    )
  } else if (token === '' || preview.isError || !preview.data) {
    body = (
      <>
        <h1>This invitation does not work</h1>
        <Alert>
          {token === ''
            ? 'The link is incomplete. Open the whole link you were sent.'
            : 'It may have expired, been used, or been withdrawn. Ask the person who invited you for a new link.'}
        </Alert>
        <Link to="/login">Go to sign in</Link>
      </>
    )
  } else {
    offersForm = true
    body = (
      <>
        <h1>Join {preview.data.householdName}</h1>
        <p className={styles.note}>
          You were invited as {preview.data.role === 'owner' ? 'an owner' : 'a member'}. Choose how
          you will sign in.
        </p>
        {error ? <Alert>{error.message}</Alert> : null}
        {providers.local ? (
          <>
            <TextField
              label="Username"
              name="username"
              autoComplete="username"
              required
              autoCapitalize="none"
              spellCheck={false}
            />
            <TextField
              label="Display name (optional)"
              name="displayName"
              autoComplete="name"
              maxLength={80}
            />
            <TextField
              label="Password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              hint="At least 12 characters. A few random words work well."
            />
            <Button type="submit" variant="primary" busy={accept.isPending || login.isPending}>
              Create account and join
            </Button>
          </>
        ) : null}
        {providers.oidc ? (
          <Button
            variant={providers.local ? 'secondary' : 'primary'}
            busy={startOidc.isPending}
            onClick={() => startOidc.mutate({ inviteToken: token })}
          >
            Join with {providers.oidc.label}
          </Button>
        ) : null}
      </>
    )
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-label="About Orbit">
        <HeroIllustration className={styles.art} />
        <p className={styles.heroTitle}>Modern tools for modern households</p>
        <p className={styles.heroText}>
          Shared dashboards for the people you live with. Self-hosted, and yours.
        </p>
      </section>
      {offersForm ? (
        <form className={styles.card} onSubmit={(event) => void submit(event)}>
          {body}
        </form>
      ) : (
        <div className={styles.card}>{body}</div>
      )}
    </main>
  )
}
