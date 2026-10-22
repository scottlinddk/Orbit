// @vitest-environment jsdom
import { act, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ME, dashboard, widget } from '../../test/fixtures.ts'
import { problem, stubApi } from '../../test/fakeApi.ts'
import { renderApp } from '../../test/render.tsx'

const api = () => ({
  'GET /api/v1/auth/me': { body: ME },
  'GET /api/v1/dashboards/d1': {
    body: dashboard({ widgets: [widget('w1', 'calendar.today'), widget('w2', 'lists.shopping')] }),
  },
  'GET /api/v1/planets/widgets': { body: { widgets: [] } },
})

afterEach(() => {
  vi.useRealTimers()
  window.localStorage.clear()
  document.documentElement.style.fontSize = ''
})

describe('kiosk page', () => {
  it('shows the dashboard full screen without the app navigation', async () => {
    stubApi(api())
    renderApp('/kiosk/d1')
    await screen.findByRole('heading', { name: 'Week', level: 1 })
    expect(screen.getByRole('main', { name: 'Week wall display' })).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(screen.queryByRole('link', { name: 'Orbit home' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Exit wall display' })).toHaveAttribute('href', '/d/d1')
  })

  it('says why the screen may sleep when the browser cannot keep it awake', async () => {
    stubApi(api())
    renderApp('/kiosk/d1')
    await screen.findByRole('heading', { name: 'Week', level: 1 })
    // jsdom has no Wake Lock API, which is what an old kiosk browser looks like too.
    expect(await screen.findByText(/cannot keep the screen awake|needs HTTPS/)).toBeInTheDocument()
  })

  it('scales the type from the address and remembers it on the device', async () => {
    stubApi(api())
    renderApp('/kiosk/d1?scale=1.5')
    await screen.findByRole('heading', { name: 'Week', level: 1 })
    expect(document.documentElement.style.fontSize).toBe('150%')
    expect(window.localStorage.getItem('orbit.kiosk.scale')).toBe('1.5')
  })

  it('falls back to the remembered scale when the address has none', async () => {
    window.localStorage.setItem('orbit.kiosk.scale', '2')
    stubApi(api())
    renderApp('/kiosk/d1')
    await screen.findByRole('heading', { name: 'Week', level: 1 })
    expect(document.documentElement.style.fontSize).toBe('200%')
  })

  it('reloads the dashboard on the refresh interval and keeps the last data when that fails', async () => {
    let fail = false
    const handlers = {
      ...api(),
      'GET /api/v1/dashboards/d1': () =>
        fail
          ? problem(503, 'down')
          : { body: dashboard({ widgets: [widget('w1', 'calendar.today')] }) },
    }
    const { sent } = stubApi(handlers)
    // Before rendering, so the page's interval is created on the fake clock.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderApp('/kiosk/d1?refresh=15')
    await screen.findByRole('heading', { name: 'Week', level: 1 })
    expect(sent('GET', '/api/v1/dashboards/d1')).toHaveLength(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    await waitFor(() => expect(sent('GET', '/api/v1/dashboards/d1')).toHaveLength(2))

    fail = true
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    expect(await screen.findByText(/Reconnecting/)).toBeInTheDocument()
    // The wall keeps showing what it had.
    expect(screen.getAllByRole('article')).toHaveLength(1)
  })

  it('ends up at the sign-in page when the session has expired', async () => {
    stubApi({
      'GET /api/v1/auth/me': { body: ME },
      'GET /api/v1/dashboards/d1': problem(401, 'expired', 'unauthenticated'),
    })
    const { router } = renderApp('/kiosk/d1')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })
})
