import {
  InsecureTestPasswordHasher,
  ManualClock,
  SequentialSessionTokens,
} from '@orbit/adapter-in-memory'
import {
  DEFAULT_SESSION_TTL_MS,
  InvalidCredentialsError,
  NotFoundError,
  RegistrationClosedError,
  SetupCodeInvalidError,
  UsernameTakenError,
  createAuth,
  type RegistrationPolicy,
  type SetupGate,
} from '@orbit/application'
import { InvariantViolation, Username } from '@orbit/domain'
import { beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryRepositories, createSqliteRepositories } from './fixtures.ts'
import type { RepositorySet } from './repository-contracts.ts'

const PASSWORD = 'correct horse battery'

describe.each([
  ['in-memory', createInMemoryRepositories],
  ['sqlite', createSqliteRepositories],
])('auth use cases: %s', (_name, makeRepos) => {
  let repos: RepositorySet
  let clock: ManualClock
  const build = (registrationPolicy: RegistrationPolicy = 'open', setupGate?: SetupGate) => {
    let n = 0
    return createAuth({
      accounts: repos.accounts,
      sessions: repos.sessions,
      hasher: new InsecureTestPasswordHasher(),
      tokens: new SequentialSessionTokens(),
      clock,
      ids: { next: () => `id-${++n}` },
      invitations: repos.invitations,
      households: repos.households,
      registrationPolicy,
      setupGate,
    })
  }

  beforeEach(() => {
    repos = makeRepos()
    clock = new ManualClock()
  })

  describe('setup gate', () => {
    const gate = (): SetupGate & { closed: boolean } => {
      const g = {
        closed: false,
        isOpen: () => !g.closed,
        accepts: (code: string | undefined) => code === 'right',
        close: () => void (g.closed = true),
      }
      return g
    }

    it('refuses the first account without the code and creates nothing', async () => {
      const g = gate()
      const auth = build('first-user-only', g)
      expect(auth.setupCodeRequired()).toBe(true)
      await expect(auth.register({ username: 'alice', password: PASSWORD })).rejects.toBeInstanceOf(
        SetupCodeInvalidError,
      )
      await expect(
        auth.register({ username: 'alice', password: PASSWORD, setupCode: 'wrong' }),
      ).rejects.toBeInstanceOf(SetupCodeInvalidError)
      expect(g.closed).toBe(false)
      expect(await repos.accounts.findCredential(Username('alice'))).toBeUndefined()
    })

    it('closes the gate after the owner is created', async () => {
      const g = gate()
      const auth = build('first-user-only', g)
      await auth.register({ username: 'alice', password: PASSWORD, setupCode: 'right' })
      expect(g.closed).toBe(true)
      expect(auth.setupCodeRequired()).toBe(false)
    })

    it('closes the gate when an owner already exists, for example from the CLI', async () => {
      const g = gate()
      await build('open').register({ username: 'alice', password: PASSWORD })
      const auth = build('first-user-only', g)
      await expect(
        auth.register({ username: 'bobby', password: PASSWORD, setupCode: 'right' }),
      ).rejects.toBeInstanceOf(RegistrationClosedError)
      expect(g.closed).toBe(true)
    })
  })

  it('registers and logs in, and the session resolves to the same user', async () => {
    const auth = build()
    const userId = (await auth.register({ username: 'Alice', password: PASSWORD })).id
    const login = await auth.login({ username: 'alice', password: PASSWORD })
    expect(login.userId).toBe(userId)
    expect(await auth.authenticate(login.token)).toEqual({ userId })
  })

  it('defaults the display name to the username and keeps a given one', async () => {
    const auth = build()
    const a = await auth.register({ username: 'alice', password: PASSWORD })
    const b = await auth.register({ username: 'bobby', password: PASSWORD, displayName: ' Bob ' })
    expect(a.displayName).toBe('alice')
    expect(b.displayName).toBe('Bob')
    expect(await repos.users.get(b.id)).toEqual(b)
  })

  it('treats usernames case-insensitively', async () => {
    const auth = build()
    await auth.register({ username: 'alice', password: PASSWORD })
    await expect(auth.register({ username: 'ALICE', password: PASSWORD })).rejects.toBeInstanceOf(
      UsernameTakenError,
    )
    await expect(auth.login({ username: 'ALICE', password: PASSWORD })).resolves.toBeDefined()
  })

  it.each([
    ['too short', 'short'],
    ['too long', 'x'.repeat(129)],
    ['equal to the username', 'alice-login-name'],
  ])('rejects a password that is %s', async (_label, password) => {
    const auth = build()
    await expect(
      auth.register({ username: password === 'alice-login-name' ? password : 'alice', password }),
    ).rejects.toBeInstanceOf(InvariantViolation)
  })

  it('closes registration after the first account under first-user-only', async () => {
    const auth = build('first-user-only')
    await auth.register({ username: 'alice', password: PASSWORD })
    await expect(auth.register({ username: 'bobby', password: PASSWORD })).rejects.toBeInstanceOf(
      RegistrationClosedError,
    )
  })

  it('gives the same error for a wrong password, an unknown user and a malformed name', async () => {
    const auth = build()
    await auth.register({ username: 'alice', password: PASSWORD })
    const errors = await Promise.all(
      [
        { username: 'alice', password: 'wrong password!!' },
        { username: 'nobody', password: PASSWORD },
        { username: '??', password: PASSWORD },
      ].map((input) => auth.login(input).catch((e) => e)),
    )
    for (const e of errors) expect(e).toBeInstanceOf(InvalidCredentialsError)
    expect(new Set(errors.map((e) => e.message)).size).toBe(1)
  })

  it('issues a different token on every login', async () => {
    const auth = build()
    await auth.register({ username: 'alice', password: PASSWORD })
    const a = await auth.login({ username: 'alice', password: PASSWORD })
    const b = await auth.login({ username: 'alice', password: PASSWORD })
    expect(a.token).not.toBe(b.token)
  })

  it('never stores the raw token', async () => {
    const auth = build()
    await auth.register({ username: 'alice', password: PASSWORD })
    const { token } = await auth.login({ username: 'alice', password: PASSWORD })
    expect(await repos.sessions.get(token)).toBeUndefined()
  })

  it('rejects unknown tokens and ends a session on logout', async () => {
    const auth = build()
    await auth.register({ username: 'alice', password: PASSWORD })
    const { token } = await auth.login({ username: 'alice', password: PASSWORD })
    expect(await auth.authenticate('made-up')).toBeUndefined()
    await auth.logout(token)
    expect(await auth.authenticate(token)).toBeUndefined()
  })

  it('expires sessions at the deadline and removes them', async () => {
    const auth = build()
    await auth.register({ username: 'alice', password: PASSWORD })
    const { token } = await auth.login({ username: 'alice', password: PASSWORD })
    clock.advance(DEFAULT_SESSION_TTL_MS - 1)
    expect(await auth.authenticate(token)).toBeDefined()
    clock.advance(1)
    expect(await auth.authenticate(token)).toBeUndefined()
  })

  describe('operator password reset', () => {
    const NEW = 'a brand new passphrase'

    it('sets a new password, rejects the old one and signs the user out everywhere', async () => {
      const auth = build()
      await auth.register({ username: 'alice', password: PASSWORD })
      const first = await auth.login({ username: 'alice', password: PASSWORD })
      const second = await auth.login({ username: 'alice', password: PASSWORD })
      await auth.resetPassword({ username: 'ALICE', password: NEW })
      expect(await auth.authenticate(first.token)).toBeUndefined()
      expect(await auth.authenticate(second.token)).toBeUndefined()
      await expect(auth.login({ username: 'alice', password: PASSWORD })).rejects.toBeInstanceOf(
        InvalidCredentialsError,
      )
      await expect(auth.login({ username: 'alice', password: NEW })).resolves.toBeDefined()
    })

    it('leaves other users signed in', async () => {
      const auth = build()
      await auth.register({ username: 'alice', password: PASSWORD })
      await auth.register({ username: 'bobby', password: PASSWORD })
      const bob = await auth.login({ username: 'bobby', password: PASSWORD })
      await auth.resetPassword({ username: 'alice', password: NEW })
      expect(await auth.authenticate(bob.token)).toBeDefined()
    })

    it('applies the same password rules as registration', async () => {
      const auth = build()
      await auth.register({ username: 'alice', password: PASSWORD })
      await expect(
        auth.resetPassword({ username: 'alice', password: 'short' }),
      ).rejects.toBeInstanceOf(InvariantViolation)
      await expect(auth.login({ username: 'alice', password: PASSWORD })).resolves.toBeDefined()
    })

    it('reports an unknown user', async () => {
      await expect(
        build().resetPassword({ username: 'nobody', password: NEW }),
      ).rejects.toBeInstanceOf(NotFoundError)
    })
  })

  it('purges expired sessions in bulk', async () => {
    const auth = build()
    await auth.register({ username: 'alice', password: PASSWORD })
    await auth.login({ username: 'alice', password: PASSWORD })
    await auth.login({ username: 'alice', password: PASSWORD })
    clock.advance(DEFAULT_SESSION_TTL_MS)
    expect(await auth.purgeExpiredSessions()).toBe(2)
  })
})
