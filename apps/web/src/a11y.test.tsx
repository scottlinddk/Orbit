// @vitest-environment jsdom
import { screen } from '@testing-library/react'
import { describe, it } from 'vitest'
import { expectNoA11yViolations } from './test/a11y.ts'
import { ME, dashboard, household, widget } from './test/fixtures.ts'
import { problem, stubApi } from './test/fakeApi.ts'
import { renderApp } from './test/render.tsx'

describe('accessibility (axe)', () => {
  it('login page', async () => {
    stubApi({ 'GET /api/v1/auth/me': problem(401, 'Sign in required', 'unauthenticated') })
    renderApp('/login')
    await screen.findByRole('heading', { name: 'Sign in to Orbit' })
    await expectNoA11yViolations()
  })

  it('create account form', async () => {
    stubApi({ 'GET /api/v1/auth/me': problem(401, 'Sign in required', 'unauthenticated') })
    const { user } = renderApp('/login')
    await user.click(await screen.findByRole('button', { name: 'Create the first account' }))
    await expectNoA11yViolations()
  })

  it('household page for an owner', async () => {
    stubApi({
      'GET /api/v1/auth/me': { body: ME },
      'GET /api/v1/households': { body: { households: [household()] } },
      'GET /api/v1/households/h1': { body: household() },
      'GET /api/v1/households/h1/dashboards': { body: { dashboards: [dashboard()] } },
    })
    renderApp('/h/h1')
    await screen.findByLabelText('Add a member by username')
    await expectNoA11yViolations()
  })

  it('dashboard page while editing', async () => {
    const d = dashboard({
      widgets: [widget('w1', 'calendar.today'), widget('w2', 'lists.shopping')],
    })
    stubApi({
      'GET /api/v1/auth/me': { body: ME },
      'GET /api/v1/households': { body: { households: [household()] } },
      'GET /api/v1/households/h1': { body: household() },
      'GET /api/v1/dashboards/d1': { body: d },
    })
    const { user } = renderApp('/d/d1')
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await screen.findByRole('heading', { name: 'Edit dashboard' })
    await expectNoA11yViolations()
  })
})
