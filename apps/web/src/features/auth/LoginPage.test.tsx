// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ME, household } from '../../test/fixtures.ts'
import { problem, stubApi } from '../../test/fakeApi.ts'
import { renderApp } from '../../test/render.tsx'
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

  it('explains when registration is closed and does not try to sign in', async () => {
    const api = stubApi({
      'GET /api/v1/auth/me': problem(401, 'Sign in required', 'unauthenticated'),
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
    stubApi({ 'GET /api/v1/auth/me': problem(401, 'Sign in required', 'unauthenticated') })
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
