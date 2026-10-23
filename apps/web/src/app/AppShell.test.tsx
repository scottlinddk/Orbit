// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ME, household } from '../test/fixtures.ts'
import { problem, stubApi } from '../test/fakeApi.ts'
import { renderApp } from '../test/render.tsx'
import { goTo } from '../api/navigate.ts'

vi.mock('../api/navigate.ts', () => ({ goTo: vi.fn() }))

describe('app shell', () => {
  it('lists the households and switches between them', async () => {
    const other = household({ id: 'h2', name: 'Cabin' })
    stubApi({
      'GET /api/v1/auth/me': { body: ME },
      'GET /api/v1/households': { body: { households: [household(), other] } },
      'GET /api/v1/households/h1': { body: household() },
      'GET /api/v1/households/h1/dashboards': { body: { dashboards: [] } },
      'GET /api/v1/households/h1/invitations': { body: { invitations: [] } },
      'GET /api/v1/households/h2': { body: other },
      'GET /api/v1/households/h2/dashboards': { body: { dashboards: [] } },
      'GET /api/v1/households/h2/invitations': { body: { invitations: [] } },
    })
    const { user } = renderApp('/h/h1')
    const switcher = await screen.findByLabelText('Household')
    expect(switcher).toHaveValue('h1')
    await user.selectOptions(switcher, 'h2')
    expect(await screen.findByRole('heading', { name: 'Cabin', level: 1 })).toBeInTheDocument()
  })

  it('signs out without sending any further data requests', async () => {
    const api = stubApi({
      'GET /api/v1/auth/me': { body: ME },
      'GET /api/v1/households': { body: { households: [household()] } },
      'GET /api/v1/households/h1': { body: household() },
      'GET /api/v1/households/h1/dashboards': { body: { dashboards: [] } },
      'GET /api/v1/households/h1/invitations': { body: { invitations: [] } },
      'POST /api/v1/auth/logout': { status: 204 },
    })
    const { user } = renderApp('/h/h1')
    await screen.findByRole('heading', { name: 'Home', level: 1 })
    const before = api.calls.length
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in to Orbit' })).toBeInTheDocument()
    await waitFor(() => expect(api.sent('POST', '/api/v1/auth/logout')).toHaveLength(1))

    // The login page asks how people may sign in. That is the instance's setting, not user data.
    const after = api.calls
      .slice(before)
      .map((c) => `${c.method} ${c.path}`)
      .filter((call) => call !== 'GET /api/v1/auth/providers')
    expect(after).toEqual(['POST /api/v1/auth/logout'])
  })

  it('shows nothing from the previous session to the next person', async () => {
    stubApi({
      'GET /api/v1/auth/me': { body: ME },
      'GET /api/v1/households': { body: { households: [household()] } },
      'GET /api/v1/households/h1': { body: household() },
      'GET /api/v1/households/h1/dashboards': { body: { dashboards: [] } },
      'GET /api/v1/households/h1/invitations': { body: { invitations: [] } },
      'POST /api/v1/auth/logout': { status: 204 },
    })
    const { user, queryClient } = renderApp('/h/h1')
    await screen.findByRole('heading', { name: 'Home', level: 1 })
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByRole('heading', { name: 'Sign in to Orbit' })
    // An observer that is still mounted may recreate an empty, disabled entry. What must not
    // survive is data: nothing but the (now empty) user may hold a value.
    await waitFor(() => {
      const holdingData = queryClient
        .getQueryCache()
        .findAll()
        .filter(
          (query) =>
            query.queryKey[0] !== 'me' &&
            // How sign-in works on this instance, the same for everyone.
            query.queryKey[0] !== 'auth-providers' &&
            query.state.data !== undefined,
        )
      expect(holdingData).toHaveLength(0)
    })
    expect(queryClient.getQueryData(['me'])).toBeNull()
  })

  it('has a skip link and a main landmark', async () => {
    stubApi({
      'GET /api/v1/auth/me': { body: ME },
      'GET /api/v1/households': { body: { households: [] } },
    })
    renderApp('/')
    expect(await screen.findByRole('link', { name: 'Skip to content' })).toHaveAttribute(
      'href',
      '#main',
    )
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('treats an expired session on the first request as signed out', async () => {
    stubApi({ 'GET /api/v1/auth/me': problem(401, 'Sign in required', 'unauthenticated') })
    renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Sign in to Orbit' })).toBeInTheDocument()
  })

  describe('single sign-on', () => {
    const shell = (providers: unknown) => ({
      'GET /api/v1/auth/me': { body: ME },
      'GET /api/v1/auth/providers': { body: providers },
      'GET /api/v1/households': { body: { households: [household()] } },
      'GET /api/v1/households/h1': { body: household() },
      'GET /api/v1/households/h1/dashboards': { body: { dashboards: [] } },
      'GET /api/v1/households/h1/invitations': { body: { invitations: [] } },
    })

    it('starts linking the provider account for the signed-in user', async () => {
      const api = stubApi({
        ...shell({ local: true, oidc: { label: 'Home login' } }),
        'POST /api/v1/auth/oidc/start': {
          body: { authorizationUrl: 'https://id.example.com/authorize' },
        },
      })
      const { user } = renderApp('/h/h1')
      await user.click(await screen.findByRole('button', { name: 'Link Home login' }))
      await waitFor(() => expect(goTo).toHaveBeenCalledWith('https://id.example.com/authorize'))
      expect(api.sent('POST', '/api/v1/auth/oidc/start')[0]?.body).toEqual({ link: true })
    })

    it('says so after a successful link', async () => {
      stubApi(shell({ local: true, oidc: { label: 'Home login' } }))
      renderApp('/h/h1?oidc=linked')
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent('Your Home login account is linked'),
      )
    })

    it('shows no link button without a provider', async () => {
      stubApi(shell({ local: true, oidc: null }))
      renderApp('/h/h1')
      await screen.findByRole('heading', { name: 'Home', level: 1 })
      expect(screen.queryByRole('button', { name: /^Link / })).not.toBeInTheDocument()
    })
  })
})
