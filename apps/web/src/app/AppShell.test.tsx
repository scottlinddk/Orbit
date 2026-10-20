// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ME, household } from '../test/fixtures.ts'
import { problem, stubApi } from '../test/fakeApi.ts'
import { renderApp } from '../test/render.tsx'

describe('app shell', () => {
  it('lists the households and switches between them', async () => {
    const other = household({ id: 'h2', name: 'Cabin' })
    stubApi({
      'GET /api/v1/auth/me': { body: ME },
      'GET /api/v1/households': { body: { households: [household(), other] } },
      'GET /api/v1/households/h1': { body: household() },
      'GET /api/v1/households/h1/dashboards': { body: { dashboards: [] } },
      'GET /api/v1/households/h2': { body: other },
      'GET /api/v1/households/h2/dashboards': { body: { dashboards: [] } },
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
      'POST /api/v1/auth/logout': { status: 204 },
    })
    const { user } = renderApp('/h/h1')
    await screen.findByRole('heading', { name: 'Home', level: 1 })
    const before = api.calls.length
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in to Orbit' })).toBeInTheDocument()
    await waitFor(() => expect(api.sent('POST', '/api/v1/auth/logout')).toHaveLength(1))

    const after = api.calls.slice(before).map((c) => `${c.method} ${c.path}`)
    expect(after).toEqual(['POST /api/v1/auth/logout'])
  })

  it('shows nothing from the previous session to the next person', async () => {
    stubApi({
      'GET /api/v1/auth/me': { body: ME },
      'GET /api/v1/households': { body: { households: [household()] } },
      'GET /api/v1/households/h1': { body: household() },
      'GET /api/v1/households/h1/dashboards': { body: { dashboards: [] } },
      'POST /api/v1/auth/logout': { status: 204 },
    })
    const { user, queryClient } = renderApp('/h/h1')
    await screen.findByRole('heading', { name: 'Home', level: 1 })
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByRole('heading', { name: 'Sign in to Orbit' })
    await waitFor(() =>
      expect(queryClient.getQueryCache().findAll({ queryKey: ['households'] })).toHaveLength(0),
    )
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
})
