// @vitest-environment jsdom
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ME, household } from '../../test/fixtures.ts'
import { problem, stubApi } from '../../test/fakeApi.ts'
import { renderApp } from '../../test/render.tsx'
import { goTo } from '../../api/navigate.ts'
import { tokenFromHash } from './JoinPage.tsx'

vi.mock('../../api/navigate.ts', () => ({ goTo: vi.fn() }))

const signedOut = { 'GET /api/v1/auth/me': problem(401, 'Sign in required', 'unauthenticated') }
const preview = {
  'POST /api/v1/invitations/preview': { body: { householdName: 'Hansens', role: 'member' } },
}

describe('join page', () => {
  it('reads the token from the fragment', () => {
    expect(tokenFromHash('#abc_DEF-123')).toBe('abc_DEF-123')
    expect(tokenFromHash('')).toBe('')
    expect(tokenFromHash('#%E0%A4%A')).toBe('%E0%A4%A')
  })

  it('shows what is being joined and sends the token only in request bodies', async () => {
    const stub = stubApi({ ...signedOut, ...preview })
    renderApp('/join#tok-123')
    expect(await screen.findByRole('heading', { name: 'Join Hansens' })).toBeInTheDocument()
    expect(screen.getByText(/invited as a member/)).toBeInTheDocument()
    const call = stub.sent('POST', '/api/v1/invitations/preview')[0]
    expect(call?.body).toEqual({ token: 'tok-123' })
    expect(stub.calls.map((c) => c.path).join(' ')).not.toContain('tok-123')
  })

  it('creates the account, signs in and lands in the app', async () => {
    const h = household({ id: 'h1', name: 'Hansens' })
    let signedIn = false
    const stub = stubApi({
      'GET /api/v1/auth/me': () =>
        signedIn ? { body: ME } : problem(401, 'Sign in', 'unauthenticated'),
      ...preview,
      'POST /api/v1/invitations/accept': { status: 201, body: ME },
      'POST /api/v1/auth/login': () => {
        signedIn = true
        return { body: ME }
      },
      'GET /api/v1/households': { body: { households: [h] } },
      'GET /api/v1/households/h1': { body: h },
      'GET /api/v1/households/h1/dashboards': { body: { dashboards: [] } },
      'GET /api/v1/households/h1/invitations': { body: { invitations: [] } },
    })
    const { user } = renderApp('/join#tok-123')
    await user.type(await screen.findByLabelText('Username'), 'bobby')
    await user.type(screen.getByLabelText('Password'), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: 'Create account and join' }))

    expect(await screen.findByRole('heading', { name: 'Hansens', level: 1 })).toBeInTheDocument()
    expect(stub.sent('POST', '/api/v1/invitations/accept')[0]?.body).toEqual({
      token: 'tok-123',
      username: 'bobby',
      password: 'correct horse battery',
    })
  })

  it('lets the invitee pick another username when theirs is taken', async () => {
    stubApi({
      ...signedOut,
      ...preview,
      'POST /api/v1/invitations/accept': problem(409, 'That username is taken', 'username-taken'),
    })
    const { user } = renderApp('/join#tok-123')
    await user.type(await screen.findByLabelText('Username'), 'alice')
    await user.type(screen.getByLabelText('Password'), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: 'Create account and join' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That username is taken')
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
  })

  it.each([
    ['an invalid link', '/join#nope', true],
    ['a link without a token', '/join', false],
  ])('explains %s without offering the form', async (_label, path, asksServer) => {
    stubApi({
      ...signedOut,
      ...(asksServer
        ? { 'POST /api/v1/invitations/preview': problem(404, 'Not found', 'not-found') }
        : {}),
    })
    renderApp(path)
    expect(
      await screen.findByRole('heading', { name: 'This invitation does not work' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/login')
  })

  it('does not silently switch accounts for someone who is already signed in', async () => {
    const stub = stubApi({ 'GET /api/v1/auth/me': { body: ME }, ...preview })
    renderApp('/join#tok-123')
    expect(
      await screen.findByRole('heading', { name: 'You are already signed in' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
    expect(stub.sent('POST', '/api/v1/invitations/accept')).toHaveLength(0)
  })
})

describe('join page with single sign-on', () => {
  it('lets the invitee join with the provider, sending the token in the body only', async () => {
    const stub = stubApi({
      ...signedOut,
      ...preview,
      'GET /api/v1/auth/providers': { body: { local: true, oidc: { label: 'Home login' } } },
      'POST /api/v1/auth/oidc/start': {
        body: { authorizationUrl: 'https://id.example.com/authorize' },
      },
    })
    const { user } = renderApp('/join#tok-123')
    await user.click(await screen.findByRole('button', { name: 'Join with Home login' }))
    await vi.waitFor(() => expect(goTo).toHaveBeenCalledWith('https://id.example.com/authorize'))
    expect(stub.sent('POST', '/api/v1/auth/oidc/start')[0]?.body).toEqual({
      inviteToken: 'tok-123',
    })
    expect(stub.calls.map((c) => c.path).join(' ')).not.toContain('tok-123')
  })

  it('offers only the provider when password sign-up is off', async () => {
    stubApi({
      ...signedOut,
      ...preview,
      'GET /api/v1/auth/providers': { body: { local: false, oidc: { label: 'Home login' } } },
    })
    renderApp('/join#tok-123')
    expect(await screen.findByRole('button', { name: 'Join with Home login' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Create account and join' }),
    ).not.toBeInTheDocument()
  })
})
