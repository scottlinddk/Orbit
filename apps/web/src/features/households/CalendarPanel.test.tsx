// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ME, dashboard, household, memberOnlyHousehold } from '../../test/fixtures.ts'
import { problem, stubApi } from '../../test/fakeApi.ts'
import { renderApp } from '../../test/render.tsx'

const source = {
  id: 's1',
  name: 'Family',
  color: '#3366ff',
  host: 'cal.example.com',
  createdAt: '2026-01-01T00:00:00.000Z',
}

const api = (h = household()) => ({
  'GET /api/v1/auth/me': { body: ME },
  'GET /api/v1/households': { body: { households: [h] } },
  'GET /api/v1/households/h1': { body: h },
  'GET /api/v1/households/h1/dashboards': { body: { dashboards: [dashboard()] } },
  'GET /api/v1/households/h1/invitations': { body: { invitations: [] } },
})

describe('calendar panel', () => {
  it('lists the connected calendars by name and host, never by address', async () => {
    stubApi({
      ...api(),
      'GET /api/v1/households/h1/calendar/sources': { body: { sources: [source] } },
    })
    renderApp('/h/h1')
    const panel = await screen.findByRole('region', { name: 'Calendars' })
    expect(await within(panel).findByText(/Family · cal\.example\.com/)).toBeInTheDocument()
  })

  it('lets an owner add a calendar and sends the address once', async () => {
    let sources = [] as (typeof source)[]
    const stub = stubApi({
      ...api(),
      'GET /api/v1/households/h1/calendar/sources': () => ({ body: { sources } }),
      'POST /api/v1/households/h1/calendar/sources': () => {
        sources = [source]
        return { status: 201, body: source }
      },
    })
    const { user } = renderApp('/h/h1')
    await user.type(await screen.findByLabelText('Calendar name'), 'Family')
    await user.type(
      screen.getByLabelText('ICS address'),
      'https://cal.example.com/private/secret/family.ics',
    )
    await user.click(screen.getByRole('button', { name: 'Add calendar' }))
    expect(await screen.findByText(/Family · cal\.example\.com/)).toBeInTheDocument()
    expect(stub.sent('POST', '/api/v1/households/h1/calendar/sources')[0]?.body).toEqual({
      name: 'Family',
      url: 'https://cal.example.com/private/secret/family.ics',
      color: '#3b82f6',
    })
    // The form is cleared, so the address does not linger on screen.
    expect(screen.getByLabelText('ICS address')).toHaveValue('')
    expect(screen.queryByText(/secret/)).not.toBeInTheDocument()
  })

  it('shows why a calendar was refused', async () => {
    stubApi({
      ...api(),
      'POST /api/v1/households/h1/calendar/sources': problem(
        422,
        'That calendar could not be read. The calendar server answered with status 404.',
      ),
    })
    const { user } = renderApp('/h/h1')
    await user.type(await screen.findByLabelText('Calendar name'), 'Gone')
    await user.type(screen.getByLabelText('ICS address'), 'https://cal.example.com/gone.ics')
    await user.click(screen.getByRole('button', { name: 'Add calendar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('status 404')
  })

  it('removes a calendar', async () => {
    let sources = [source]
    const stub = stubApi({
      ...api(),
      'GET /api/v1/households/h1/calendar/sources': () => ({ body: { sources } }),
      'DELETE /api/v1/households/h1/calendar/sources/s1': () => {
        sources = []
        return { status: 204 }
      },
    })
    const { user } = renderApp('/h/h1')
    await user.click(await screen.findByRole('button', { name: 'Remove calendar Family' }))
    expect(await screen.findByText('No calendars connected yet.')).toBeInTheDocument()
    expect(stub.sent('DELETE', '/api/v1/households/h1/calendar/sources/s1')).toHaveLength(1)
  })

  it('is not shown to members', async () => {
    const stub = stubApi(api(memberOnlyHousehold()))
    renderApp('/h/h1')
    await screen.findByRole('heading', { name: 'Home', level: 1 })
    expect(screen.queryByRole('region', { name: 'Calendars' })).not.toBeInTheDocument()
    expect(stub.sent('GET', '/api/v1/households/h1/calendar/sources')).toHaveLength(0)
  })
})
