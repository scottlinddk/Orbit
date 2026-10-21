// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ME, dashboard, household, memberOnlyHousehold, widget } from '../../test/fixtures.ts'
import { problem, stubApi } from '../../test/fakeApi.ts'
import { renderApp } from '../../test/render.tsx'

const api = (h = household()) => ({
  'GET /api/v1/auth/me': { body: ME },
  'GET /api/v1/households': { body: { households: [h] } },
  'GET /api/v1/households/h1': { body: h },
  'GET /api/v1/households/h1/dashboards': {
    body: {
      dashboards: [
        dashboard({ widgets: [widget('w', 'calendar.today')] }),
        dashboard({ id: 'd2', name: 'Kitchen' }),
      ],
    },
  },
  'GET /api/v1/households/h1/invitations': { body: { invitations: [] } },
})

describe('household page', () => {
  it('lists dashboards with widget counts', async () => {
    stubApi(api())
    renderApp('/h/h1')
    expect(await screen.findByRole('link', { name: 'Week' })).toHaveAttribute('href', '/d/d1')
    expect(screen.getByRole('link', { name: 'Kitchen' })).toHaveAttribute('href', '/d/d2')
    expect(screen.getByText('1 widget')).toBeInTheDocument()
    expect(screen.getByText('0 widgets')).toBeInTheDocument()
  })

  it('lets owners create a dashboard and opens it', async () => {
    const created = dashboard({ id: 'd9', name: 'Garage' })
    const stub = stubApi({
      ...api(),
      'POST /api/v1/households/h1/dashboards': { status: 201, body: created },
      'GET /api/v1/dashboards/d9': { body: created },
    })
    const { user } = renderApp('/h/h1')
    await user.type(await screen.findByLabelText('New dashboard name'), 'Garage')
    await user.click(screen.getByRole('button', { name: 'Create dashboard' }))
    expect(await screen.findByRole('heading', { name: 'Garage', level: 1 })).toBeInTheDocument()
    expect(stub.sent('POST', '/api/v1/households/h1/dashboards')[0]?.body).toEqual({
      name: 'Garage',
    })
  })

  it('gives members no forms', async () => {
    const stub = stubApi(api(memberOnlyHousehold()))
    renderApp('/h/h1')
    await screen.findByRole('heading', { name: 'Home', level: 1 })
    expect(screen.queryByRole('region', { name: 'Invite someone' })).not.toBeInTheDocument()
    expect(stub.sent('GET', '/api/v1/households/h1/invitations')).toHaveLength(0)
    expect(screen.queryByLabelText('New dashboard name')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Add a member by username')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove member/ })).not.toBeInTheDocument()
  })

  it('shows who you are and the other members by role', async () => {
    stubApi(
      api(
        household({
          members: [
            { userId: ME.id, role: 'owner' },
            { userId: 'u2', role: 'member' },
          ],
        }),
      ),
    )
    renderApp('/h/h1')
    const members = await screen.findByRole('region', { name: 'Members' })
    expect(within(members).getByText(/^You · owner/)).toBeInTheDocument()
    expect(within(members).getByText(/Member 2 · member/)).toBeInTheDocument()
  })

  it('adds a member by username', async () => {
    const after = household({
      members: [
        { userId: ME.id, role: 'owner' },
        { userId: 'u2', role: 'member' },
      ],
    })
    const stub = stubApi({ ...api(), 'POST /api/v1/households/h1/members': { body: after } })
    const { user } = renderApp('/h/h1')
    await user.type(await screen.findByLabelText('Add a member by username'), 'bobby')
    await user.click(screen.getByRole('button', { name: 'Add member' }))
    expect(await screen.findByText(/Member 2 · member/)).toBeInTheDocument()
    expect(stub.sent('POST', '/api/v1/households/h1/members')[0]?.body).toEqual({
      username: 'bobby',
    })
    expect(screen.getByLabelText('Add a member by username')).toHaveValue('')
  })

  it('shows why adding a member failed', async () => {
    stubApi({
      ...api(),
      'POST /api/v1/households/h1/members': problem(404, 'Not found', 'not-found'),
    })
    const { user } = renderApp('/h/h1')
    await user.type(await screen.findByLabelText('Add a member by username'), 'ghost')
    await user.click(screen.getByRole('button', { name: 'Add member' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Not found')
  })

  it('removes a member', async () => {
    const before = household({
      members: [
        { userId: ME.id, role: 'owner' },
        { userId: 'u2', role: 'member' },
      ],
    })
    const stub = stubApi({
      ...api(before),
      'DELETE /api/v1/households/h1/members/u2': { body: household() },
    })
    const { user } = renderApp('/h/h1')
    await user.click(await screen.findByRole('button', { name: 'Remove member 2' }))
    expect(await screen.findByText(/^You · owner/)).toBeInTheDocument()
    expect(screen.queryByText(/Member 2/)).not.toBeInTheDocument()
    expect(stub.sent('DELETE', '/api/v1/households/h1/members/u2')).toHaveLength(1)
  })

  it('does not offer to remove yourself', async () => {
    stubApi(api())
    renderApp('/h/h1')
    await screen.findByRole('heading', { name: 'Home', level: 1 })
    expect(screen.queryByRole('button', { name: /Remove member/ })).not.toBeInTheDocument()
  })

  it('sends a signed-in user with no household to onboarding, and then to the new household', async () => {
    const created = household({ id: 'h7', name: 'Hansens' })
    stubApi({
      'GET /api/v1/auth/me': { body: ME },
      'GET /api/v1/households': { body: { households: [] } },
      'POST /api/v1/households': { status: 201, body: created },
      'GET /api/v1/households/h7': { body: created },
      'GET /api/v1/households/h7/dashboards': { body: { dashboards: [] } },
      'GET /api/v1/households/h7/invitations': { body: { invitations: [] } },
    })
    const { user } = renderApp('/')
    await user.type(await screen.findByLabelText('Household name'), 'Hansens')
    await user.click(screen.getByRole('button', { name: 'Create household' }))
    expect(await screen.findByRole('heading', { name: 'Hansens', level: 1 })).toBeInTheDocument()
  })
})
