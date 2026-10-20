import {
  InsecureTestPasswordHasher,
  ManualClock,
  SequentialSessionTokens,
} from '@orbit/adapter-in-memory'
import {
  DEFAULT_SESSION_TTL_MS,
  InvalidCredentialsError,
  RegistrationClosedError,
  UsernameTakenError,
  createAuth,
  type RegistrationPolicy,
} from '@orbit/application'
import { InvariantViolation } from '@orbit/domain'
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
  const build = (registrationPolicy: RegistrationPolicy = 'open') => {
    let n = 0
    return createAuth({
      accounts: repos.accounts,
      sessions: repos.sessions,
      hasher: new InsecureTestPasswordHasher(),
      tokens: new SequentialSessionTokens(),
      clock,
      ids: { next: () => `id-${++n}` },
      registrationPolicy,
    })
  }

  beforeEach(() => {
    repos = makeRepos()
    clock = new ManualClock()
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

  it('purges expired sessions in bulk', async () => {
    const auth = build()
    await auth.register({ username: 'alice', password: PASSWORD })
    await auth.login({ username: 'alice', password: PASSWORD })
    await auth.login({ username: 'alice', password: PASSWORD })
    clock.advance(DEFAULT_SESSION_TTL_MS)
    expect(await auth.purgeExpiredSessions()).toBe(2)
  })
})
