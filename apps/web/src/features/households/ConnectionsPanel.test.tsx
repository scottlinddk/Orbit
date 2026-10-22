// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ME, dashboard, household, memberOnlyHousehold } from '../../test/fixtures.ts'
import { problem, stubApi } from '../../test/fakeApi.ts'
import { renderApp } from '../../test/render.tsx'

const connection = {
  id: 'c1',
  kind: 'homeassistant',
  name: 'Home Assistant',
  host: 'ha.local:8123',
  mirrors: [],
  createdAt: '2026-01-01T00:00:00.000Z',
}

const api = (h = household()) => ({
  'GET /api/v1/auth/me': { body: ME },
  'GET /api/v1/households': { body: { households: [h] } },
  'GET /api/v1/households/h1': { body: h },
  'GET /api/v1/households/h1/dashboards': { body: { dashboards: [dashboard()] } },
  'GET /api/v1/households/h1/invitations': { body: { invitations: [] } },
})

describe('connections panel', () => {
  it('lists connections by name and host, never by address or token', async () => {
    stubApi({
      ...api(),
      'GET /api/v1/households/h1/connections': { body: { connections: [connection] } },
    })
    renderApp('/h/h1')
    const panel = await screen.findByRole('region', { name: 'Connections' })
    expect(
      await within(panel).findByText(/Home Assistant · ha\.local:8123 · 0 shown/),
    ).toBeVisible()
  })

  it('adds a connection, sends the secrets once, clears the form and offers the choice', async () => {
    let connections = [] as (typeof connection)[]
    const stub = stubApi({
      ...api(),
      'GET /api/v1/households/h1/connections': () => ({ body: { connections } }),
      'POST /api/v1/households/h1/connections': () => {
        connections = [connection]
        return { status: 201, body: connection }
      },
      'GET /api/v1/households/h1/connections/c1/entities': {
        body: {
          entities: [
            { entityId: 'calendar.family', role: 'calendar', name: 'Family', mirrored: false },
            { entityId: 'todo.shopping', role: 'todo', name: 'Shopping', mirrored: false },
          ],
        },
      },
    })
    const { user } = renderApp('/h/h1')
    await user.type(await screen.findByLabelText('Home Assistant address'), 'http://ha.local:8123')
    await user.type(screen.getByLabelText('Access token'), 'long-lived-secret')
    await user.click(screen.getByRole('button', { name: 'Add connection' }))
    expect(stub.sent('POST', '/api/v1/households/h1/connections')[0]?.body).toEqual({
      kind: 'homeassistant',
      name: 'Home Assistant',
      url: 'http://ha.local:8123',
      token: 'long-lived-secret',
    })
    expect(await screen.findByRole('group', { name: 'Calendars to show' })).toBeVisible()
    expect(screen.getByLabelText('Access token')).toHaveValue('')
    expect(screen.getByLabelText('Home Assistant address')).toHaveValue('')
    expect(screen.queryByText(/long-lived-secret/)).not.toBeInTheDocument()
  })

  it('saves what the owner ticks as the whole set', async () => {
    const stub = stubApi({
      ...api(),
      'GET /api/v1/households/h1/connections': { body: { connections: [connection] } },
      'GET /api/v1/households/h1/connections/c1/entities': {
        body: {
          entities: [
            { entityId: 'calendar.family', role: 'calendar', name: 'Family', mirrored: true },
            { entityId: 'todo.shopping', role: 'todo', name: 'Shopping', mirrored: false },
          ],
        },
      },
      'PUT /api/v1/households/h1/connections/c1/mirrors': { body: connection },
    })
    const { user } = renderApp('/h/h1')
    await user.click(await screen.findByRole('button', { name: /Choose what to show/ }))
    expect(await screen.findByRole('checkbox', { name: 'Family' })).toBeChecked()
    await user.click(screen.getByRole('checkbox', { name: 'Shopping' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText(/0 shown/)
    expect(stub.sent('PUT', '/api/v1/households/h1/connections/c1/mirrors')[0]?.body).toEqual({
      entityIds: ['calendar.family', 'todo.shopping'],
    })
  })

  it('reports a test, good or bad', async () => {
    stubApi({
      ...api(),
      'GET /api/v1/households/h1/connections': { body: { connections: [connection] } },
      'POST /api/v1/households/h1/connections/c1/test': {
        body: {
          ok: false,
          calendars: 0,
          todoLists: 0,
          error: 'Home Assistant refused the access token.',
        },
      },
    })
    const { user } = renderApp('/h/h1')
    await user.click(await screen.findByRole('button', { name: 'Test connection Home Assistant' }))
    expect(await screen.findByRole('status')).toHaveTextContent('refused the access token')
  })

  it('shows why a connection was refused', async () => {
    stubApi({
      ...api(),
      'POST /api/v1/households/h1/connections': problem(
        422,
        'That connection could not be used. Home Assistant refused the access token.',
      ),
    })
    const { user } = renderApp('/h/h1')
    await user.type(await screen.findByLabelText('Home Assistant address'), 'http://ha.local:8123')
    await user.type(screen.getByLabelText('Access token'), 'nope')
    await user.click(screen.getByRole('button', { name: 'Add connection' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('refused the access token')
  })

  it('removes a connection', async () => {
    let connections = [connection]
    const stub = stubApi({
      ...api(),
      'GET /api/v1/households/h1/connections': () => ({ body: { connections } }),
      'DELETE /api/v1/households/h1/connections/c1': () => {
        connections = []
        return { status: 204 }
      },
    })
    const { user } = renderApp('/h/h1')
    await user.click(
      await screen.findByRole('button', { name: 'Remove connection Home Assistant' }),
    )
    expect(await screen.findByText('No connections yet.')).toBeInTheDocument()
    expect(stub.sent('DELETE', '/api/v1/households/h1/connections/c1')).toHaveLength(1)
  })

  it('is not shown to members', async () => {
    const stub = stubApi(api(memberOnlyHousehold()))
    renderApp('/h/h1')
    await screen.findByRole('heading', { name: 'Home', level: 1 })
    expect(screen.queryByRole('region', { name: 'Connections' })).not.toBeInTheDocument()
    expect(stub.sent('GET', '/api/v1/households/h1/connections')).toHaveLength(0)
  })
})
