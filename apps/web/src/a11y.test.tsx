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
    await user.click(await screen.findByRole('button', { name: 'Edit layout' }))
    await screen.findByRole('heading', { name: 'Dashboard settings' })
    await expectNoA11yViolations()
  })

  it('dashboard page while a widget with settings is selected', async () => {
    const d = dashboard({ widgets: [widget('w1', 'budget.transactions', 2)] })
    stubApi({
      'GET /api/v1/auth/me': { body: ME },
      'GET /api/v1/households': { body: { households: [household()] } },
      'GET /api/v1/households/h1': { body: household() },
      'GET /api/v1/dashboards/d1': { body: d },
    })
    const { user } = renderApp('/d/d1')
    await user.click(await screen.findByRole('button', { name: 'Edit layout' }))
    await user.click(await screen.findByRole('button', { name: 'Options for Recent transactions' }))
    await screen.findByRole('heading', { name: 'Recent transactions options' })
    await expectNoA11yViolations()
  })

  it('the budget widgets', async () => {
    const d = dashboard({
      widgets: [
        widget('w1', 'budget.overview', 2),
        widget('w2', 'budget.cards', 2),
        widget('w3', 'budget.transactions', 2),
        widget('w4', 'budget.categories', 2),
        widget('w5', 'budget.bubbles', 2),
        widget('w6', 'budget.balance', 1),
      ],
    })
    stubApi({
      'GET /api/v1/auth/me': { body: ME },
      'GET /api/v1/households': { body: { households: [household()] } },
      'GET /api/v1/households/h1': { body: household() },
      'GET /api/v1/dashboards/d1': { body: d },
    })
    renderApp('/d/d1')
    await screen.findByRole('article', { name: 'Overview' })
    await expectNoA11yViolations()
  })

  it('appearance page', async () => {
    stubApi({
      'GET /api/v1/auth/me': { body: ME },
      'GET /api/v1/households': { body: { households: [household()] } },
    })
    renderApp('/appearance')
    await screen.findByRole('heading', { name: 'Appearance', level: 1 })
    await expectNoA11yViolations()
  })
})
