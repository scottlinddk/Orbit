// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ME, dashboard, household, memberOnlyHousehold } from '../../test/fixtures.ts'
import { problem, stubApi } from '../../test/fakeApi.ts'
import { renderApp } from '../../test/render.tsx'

const endpoint = {
  id: 'n1',
  name: 'Chat',
  host: 'hooks.example.com',
  events: ['list.item.added', 'calendar.event.starting'],
  leadMinutes: 20,
  enabled: true,
  failures: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
}

const api = (h = household()) => ({
  'GET /api/v1/auth/me': { body: ME },
  'GET /api/v1/households': { body: { households: [h] } },
  'GET /api/v1/households/h1': { body: h },
  'GET /api/v1/households/h1/dashboards': { body: { dashboards: [dashboard()] } },
  'GET /api/v1/households/h1/invitations': { body: { invitations: [] } },
})
const ENDPOINTS = '/api/v1/households/h1/notifications/endpoints'

describe('notifications panel', () => {
  it('lists webhooks by name and host, never by address, with what they send', async () => {
    stubApi({ ...api(), [`GET ${ENDPOINTS}`]: { body: { endpoints: [endpoint] } } })
    renderApp('/h/h1')
    const panel = await screen.findByRole('region', { name: 'Notifications' })
    expect(await within(panel).findByText(/hooks\.example\.com/)).toBeInTheDocument()
    expect(
      within(panel).getByText(
        /Someone adds an item to a list, A calendar event is about to start, 20 minutes before/,
      ),
    ).toBeInTheDocument()
  })

  it('adds a webhook, sends the address once and shows the signing secret once', async () => {
    let endpoints = [] as (typeof endpoint)[]
    const stub = stubApi({
      ...api(),
      [`GET ${ENDPOINTS}`]: () => ({ body: { endpoints } }),
      [`POST ${ENDPOINTS}`]: () => {
        endpoints = [endpoint]
        return { status: 201, body: { ...endpoint, signingSecret: 'abc123secret' } }
      },
    })
    const { user } = renderApp('/h/h1')
    await user.type(await screen.findByLabelText('Webhook name'), 'Chat')
    await user.type(
      screen.getByLabelText('Webhook address'),
      'https://hooks.example.com/services/T0/B0/token',
    )
    await user.click(screen.getByLabelText('A calendar event is about to start'))
    await user.clear(screen.getByLabelText('Minutes before an event'))
    await user.type(screen.getByLabelText('Minutes before an event'), '20')
    await user.click(screen.getByRole('button', { name: 'Add webhook' }))

    expect(await screen.findByLabelText('Signing secret for Chat')).toHaveValue('abc123secret')
    expect(stub.sent('POST', ENDPOINTS)[0]?.body).toEqual({
      name: 'Chat',
      url: 'https://hooks.example.com/services/T0/B0/token',
      events: ['list.item.added', 'calendar.event.starting'],
      leadMinutes: 20,
    })
    // The address is cleared from the form, so it does not linger on screen.
    expect(screen.getByLabelText('Webhook address')).toHaveValue('')
    expect(screen.queryByText(/token/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'I have saved it' }))
    expect(screen.queryByLabelText('Signing secret for Chat')).not.toBeInTheDocument()
  })

  it('needs at least one event', async () => {
    stubApi(api())
    const { user } = renderApp('/h/h1')
    await user.click(await screen.findByLabelText('Someone adds an item to a list'))
    expect(screen.getByRole('button', { name: 'Add webhook' })).toBeDisabled()
  })

  it('shows why a webhook was refused', async () => {
    stubApi({
      ...api(),
      [`POST ${ENDPOINTS}`]: problem(422, 'The address must start with http:// or https://'),
    })
    const { user } = renderApp('/h/h1')
    await user.type(await screen.findByLabelText('Webhook name'), 'Bad')
    await user.type(screen.getByLabelText('Webhook address'), 'ftp://example.com/x')
    await user.click(screen.getByRole('button', { name: 'Add webhook' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('http:// or https://')
  })

  it('sends a test and says what happened, without the address', async () => {
    stubApi({
      ...api(),
      [`GET ${ENDPOINTS}`]: { body: { endpoints: [endpoint] } },
      [`POST ${ENDPOINTS}/n1/test`]: {
        body: {
          deliveryId: 'd1',
          event: 'notification.test',
          at: '2026-01-01T00:00:00.000Z',
          attempt: 1,
          outcome: 'failed',
          httpStatus: 500,
          error: 'The server answered 500.',
        },
      },
    })
    const { user } = renderApp('/h/h1')
    await user.click(await screen.findByRole('button', { name: 'Send a test to Chat' }))
    expect(await screen.findByText(/Test failed\. The server answered 500\./)).toBeInTheDocument()
  })

  it('shows a switched-off webhook with its reason, and switches it back on', async () => {
    let current: typeof endpoint & { disabledReason?: string } = {
      ...endpoint,
      enabled: false,
      failures: 10,
      disabledReason: 'Switched off after 10 failed deliveries in a row. Last error: boom',
    }
    const stub = stubApi({
      ...api(),
      [`GET ${ENDPOINTS}`]: () => ({ body: { endpoints: [current] } }),
      [`PATCH ${ENDPOINTS}/n1`]: () => {
        current = { ...endpoint }
        return { body: current }
      },
    })
    const { user } = renderApp('/h/h1')
    expect(
      await screen.findByText(/Switched off\. Switched off after 10 failed/),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Switch on Chat' }))
    expect(await screen.findByRole('button', { name: 'Switch off Chat' })).toBeInTheDocument()
    expect(stub.sent('PATCH', `${ENDPOINTS}/n1`)[0]?.body).toEqual({ enabled: true })
  })

  it('opens the delivery log', async () => {
    stubApi({
      ...api(),
      [`GET ${ENDPOINTS}`]: { body: { endpoints: [endpoint] } },
      [`GET ${ENDPOINTS}/n1/deliveries`]: {
        body: {
          deliveries: [
            {
              deliveryId: 'd2',
              event: 'list.item.added',
              at: '2026-01-01T00:00:10.000Z',
              attempt: 2,
              outcome: 'delivered',
              httpStatus: 200,
            },
            {
              deliveryId: 'd2',
              event: 'list.item.added',
              at: '2026-01-01T00:00:00.000Z',
              attempt: 1,
              outcome: 'retrying',
              httpStatus: 503,
              error: 'The server answered 503.',
            },
          ],
        },
      },
    })
    const { user } = renderApp('/h/h1')
    await user.click(await screen.findByRole('button', { name: 'Show the log of Chat' }))
    const log = await screen.findByRole('list', { name: 'Recent deliveries' })
    expect(within(log).getAllByRole('listitem')).toHaveLength(2)
    expect(log).toHaveTextContent('delivered (200), try 2')
    expect(log).toHaveTextContent('retrying (503) · The server answered 503.')
  })

  it('removes a webhook', async () => {
    let endpoints = [endpoint]
    const stub = stubApi({
      ...api(),
      [`GET ${ENDPOINTS}`]: () => ({ body: { endpoints } }),
      [`DELETE ${ENDPOINTS}/n1`]: () => {
        endpoints = []
        return { status: 204 }
      },
    })
    const { user } = renderApp('/h/h1')
    await user.click(await screen.findByRole('button', { name: 'Remove Chat' }))
    expect(await screen.findByText('No webhooks yet.')).toBeInTheDocument()
    expect(stub.sent('DELETE', `${ENDPOINTS}/n1`)).toHaveLength(1)
  })

  it('is not shown to members, and is not even asked for', async () => {
    const stub = stubApi(api(memberOnlyHousehold()))
    renderApp('/h/h1')
    await screen.findByRole('heading', { name: 'Home', level: 1 })
    expect(screen.queryByRole('region', { name: 'Notifications' })).not.toBeInTheDocument()
    expect(stub.sent('GET', ENDPOINTS)).toHaveLength(0)
  })
})
