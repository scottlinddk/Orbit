// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ME, household } from '../../test/fixtures.ts'
import { problem, stubApi } from '../../test/fakeApi.ts'
import { renderApp } from '../../test/render.tsx'

vi.mock('../../api/navigate.ts', () => ({ goTo: vi.fn() }))
import { goTo } from '../../api/navigate.ts'
import { safeReturnPath } from './LoginPage.tsx'

describe('safeReturnPath', () => {
  it.each([
    ['/d/abc', '/d/abc'],
    ['/h/1?x=2', '/h/1?x=2'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['https://evil.example', '/'],
    ['javascript:alert(1)', '/'],
    ['', '/'],
    [undefined, '/'],
    [42, '/'],
  ])('%j becomes %j', (input, expected) => {
    expect(safeReturnPath(input)).toBe(expected)
  })
})

describe('login page', () => {
  it('sends anonymous visitors to the login page', async () => {
    stubApi({ 'GET /api/v1/auth/me': problem(401, 'Sign in required', 'unauthenticated') })
    renderApp('/d/d1')
    expect(await screen.findByRole('heading', { name: 'Sign in to Orbit' })).toBeInTheDocument()
  })

  it('signs in and lands on the household', async () => {
    const api = stubApi({
      'GET /api/v1/auth/me': problem(401, 'Sign in required', 'unauthenticated'),
      'POST /api/v1/auth/login': { body: ME },
      'GET /api/v1/households': { body: { households: [] } },
    })
    const { user } = renderApp('/login')
    await user.type(await screen.findByLabelText('Username'), 'scott')
    await user.type(screen.getByLabelText('Password'), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Welcome to Orbit' })).toBeInTheDocument()
    expect(api.sent('POST', '/api/v1/auth/login')[0]?.body).toEqual({
      username: 'scott',
      password: 'correct horse battery',
    })
  })

  it('shows the server message for wrong credentials and stays on the page', async () => {
    stubApi({
      'GET /api/v1/auth/me': problem(401, 'Sign in required', 'unauthenticated'),
      'POST /api/v1/auth/login': problem(
        401,
        'Invalid username or password',
        'invalid-credentials',
      ),
    })
    const { user } = renderApp('/login')
    await user.type(await screen.findByLabelText('Username'), 'scott')
    await user.type(screen.getByLabelText('Password'), 'not the password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid username or password')
    expect(screen.getByRole('heading', { name: 'Sign in to Orbit' })).toBeInTheDocument()
  })

  it('creates the account, then signs in with the same credentials', async () => {
    const order: string[] = []
    const api = stubApi({
      'GET /api/v1/auth/me': problem(401, 'Sign in required', 'unauthenticated'),
      'GET /api/v1/auth/setup': { body: { setupCodeRequired: false } },
      'POST /api/v1/auth/register': () => {
        order.push('register')
        return { status: 201, body: ME }
      },
      'POST /api/v1/auth/login': () => {
        order.push('login')
        return { body: ME }
      },
      'GET /api/v1/households': { body: { households: [household()] } },
      'GET /api/v1/households/h1': { body: household() },
      'GET /api/v1/households/h1/dashboards': { body: { dashboards: [] } },
    })
    const { user } = renderApp('/login')
    await user.click(await screen.findByRole('button', { name: 'Create the first account' }))
    await user.type(screen.getByLabelText('Username'), 'scott')
    await user.type(screen.getByLabelText('Display name (optional)'), 'Scott')
    await user.type(screen.getByLabelText('Password'), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('heading', { name: 'Home', level: 1 })).toBeInTheDocument()
    expect(order).toEqual(['register', 'login'])
    expect(api.sent('POST', '/api/v1/auth/register')[0]?.body).toEqual({
      username: 'scott',
      password: 'correct horse battery',
      displayName: 'Scott',
    })
  })

  it('asks for the setup code when the server requires one, and sends it', async () => {
    const api = stubApi({
      'GET /api/v1/auth/me': problem(401, 'Sign in required', 'unauthenticated'),
      'GET /api/v1/auth/setup': { body: { setupCodeRequired: true } },
      'POST /api/v1/auth/register': { status: 201, body: ME },
      'POST /api/v1/auth/login': { body: ME },
      'GET /api/v1/households': { body: { households: [] } },
    })
    const { user } = renderApp('/login')
    await user.click(await screen.findByRole('button', { name: 'Create the first account' }))
    await user.type(await screen.findByLabelText('Setup code'), 'ABCD-EFGH-JKMN')
    await user.type(screen.getByLabelText('Username'), 'scott')
    await user.type(screen.getByLabelText('Password'), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(api.sent('POST', '/api/v1/auth/login')).toHaveLength(1))
    expect(api.sent('POST', '/api/v1/auth/register')[0]?.body).toEqual({
      username: 'scott',
      password: 'correct horse battery',
      setupCode: 'ABCD-EFGH-JKMN',
    })
  })

  it('does not show a setup code field when none is required', async () => {
    stubApi({
      'GET /api/v1/auth/me': problem(401, 'Sign in required', 'unauthenticated'),
      'GET /api/v1/auth/setup': { body: { setupCodeRequired: false } },
    })
    const { user } = renderApp('/login')
    await user.click(await screen.findByRole('button', { name: 'Create the first account' }))
    await screen.findByLabelText('Display name (optional)')
    expect(screen.queryByLabelText('Setup code')).not.toBeInTheDocument()
  })

  it('shows the field after a wrong-code answer even if the status call failed', async () => {
    stubApi({
      'GET /api/v1/auth/me': problem(401, 'Sign in required', 'unauthenticated'),
      'GET /api/v1/auth/setup': { status: 500 },
      'POST /api/v1/auth/register': problem(
        403,
        'The setup code is missing or wrong.',
        'setup-code-invalid',
      ),
    })
    const { user } = renderApp('/login')
    await user.click(await screen.findByRole('button', { name: 'Create the first account' }))
    await user.type(screen.getByLabelText('Username'), 'scott')
    await user.type(screen.getByLabelText('Password'), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByLabelText('Setup code')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('setup code')
  })

  it('explains when registration is closed and does not try to sign in', async () => {
    const api = stubApi({
      'GET /api/v1/auth/me': problem(401, 'Sign in required', 'unauthenticated'),
      'GET /api/v1/auth/setup': { body: { setupCodeRequired: false } },
      'POST /api/v1/auth/register': problem(
        403,
        'Registration is closed on this instance',
        'registration-closed',
      ),
    })
    const { user } = renderApp('/login')
    await user.click(await screen.findByRole('button', { name: 'Create the first account' }))
    await user.type(screen.getByLabelText('Username'), 'scott')
    await user.type(screen.getByLabelText('Password'), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Registration is closed')
    expect(api.sent('POST', '/api/v1/auth/login')).toHaveLength(0)
  })

  it('uses the right autocomplete hints for password managers', async () => {
    stubApi({
      'GET /api/v1/auth/me': problem(401, 'Sign in required', 'unauthenticated'),
      'GET /api/v1/auth/setup': { body: { setupCodeRequired: false } },
    })
    const { user } = renderApp('/login')
    expect(await screen.findByLabelText('Password')).toHaveAttribute(
      'autocomplete',
      'current-password',
    )
    await user.click(screen.getByRole('button', { name: 'Create the first account' }))
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password')
    await waitFor(() =>
      expect(screen.getByLabelText('Username')).toHaveAttribute('autocomplete', 'username'),
    )
  })

  it('shows a decorative illustration that assistive technology skips', async () => {
    stubApi({ 'GET /api/v1/auth/me': problem(401, 'Sign in required', 'unauthenticated') })
    renderApp('/login')
    await screen.findByRole('heading', { name: 'Sign in to Orbit' })
    const art = document.querySelector('section[aria-label="About Orbit"] svg')
    expect(art).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})

describe('single sign-on', () => {
  const signedOut = { 'GET /api/v1/auth/me': problem(401, 'Sign in required', 'unauthenticated') }
  const sso = {
    'GET /api/v1/auth/providers': { body: { local: true, oidc: { label: 'Home login' } } },
  }

  it('offers the button next to the password form and sends the browser to the provider', async () => {
    const api = stubApi({
      ...signedOut,
      ...sso,
      'POST /api/v1/auth/oidc/start': {
        body: { authorizationUrl: 'https://id.example.com/authorize?x=1' },
      },
    })
    const { user } = renderApp('/login')
    expect(await screen.findByLabelText('Username')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sign in with Home login' }))
    await waitFor(() => expect(goTo).toHaveBeenCalledWith('https://id.example.com/authorize?x=1'))
    expect(api.sent('POST', '/api/v1/auth/oidc/start')[0]?.body).toEqual({})
  })

  it('refuses to follow an address that is not a web address', async () => {
    stubApi({
      ...signedOut,
      ...sso,
      'POST /api/v1/auth/oidc/start': { body: { authorizationUrl: 'javascript:alert(1)' } },
    })
    vi.mocked(goTo).mockClear()
    const { user } = renderApp('/login')
    await user.click(await screen.findByRole('button', { name: 'Sign in with Home login' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('will not open')
    expect(goTo).not.toHaveBeenCalled()
  })

  it('hides the password form when password sign-in is off, and passes the setup code', async () => {
    const api = stubApi({
      ...signedOut,
      'GET /api/v1/auth/providers': { body: { local: false, oidc: { label: 'Home login' } } },
      'GET /api/v1/auth/setup': { body: { setupCodeRequired: true } },
      'POST /api/v1/auth/oidc/start': {
        body: { authorizationUrl: 'https://id.example.com/authorize' },
      },
    })
    const { user } = renderApp('/login')
    expect(await screen.findByLabelText(/Setup code/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText(/Setup code/), 'ABCD-EFGH')
    await user.click(screen.getByRole('button', { name: 'Sign in with Home login' }))
    await waitFor(() =>
      expect(api.sent('POST', '/api/v1/auth/oidc/start')[0]?.body).toEqual({
        setupCode: 'ABCD-EFGH',
      }),
    )
  })

  it.each([
    ['closed', /does not create accounts/],
    ['denied', /did not let you in/],
    ['expired', /took too long/],
  ])('explains a failed sign-in (%s) from the address', async (code, text) => {
    stubApi({ ...signedOut, ...sso })
    renderApp(`/login?oidc=${code}`)
    expect(await screen.findByRole('alert')).toHaveTextContent(text)
  })

  it('shows no button when no provider is configured', async () => {
    stubApi(signedOut)
    renderApp('/login')
    await screen.findByLabelText('Username')
    expect(screen.queryByRole('button', { name: /Sign in with/ })).not.toBeInTheDocument()
  })
})
