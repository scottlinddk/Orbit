// @vitest-environment jsdom
import { screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ME, dashboard, household, widget } from '../test/fixtures.ts'
import { stubApi } from '../test/fakeApi.ts'
import { renderApp } from '../test/render.tsx'

afterEach(() => vi.useRealTimers())

it('requests fourteen complete local days for the agenda, including across a clock change', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-10-24T12:00:00Z'))
  stubApi({
    'GET /api/v1/auth/me': { body: ME },
    'GET /api/v1/households': { body: { households: [household()] } },
    'GET /api/v1/households/h1': { body: household() },
    'GET /api/v1/dashboards/d1': {
      body: dashboard({ widgets: [widget('w1', 'calendar.agenda')] }),
    },
    'GET /api/v1/planets/widgets': { body: { widgets: [] } },
  })
  renderApp('/d/d1')
  await screen.findByText(/Connect a calendar/)
  const call = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes('/calendar/events'))
  expect(call).toBeDefined()
  const url = new URL(String(call![0]), 'http://localhost')
  const from = new Date(2026, 9, 24)
  const to = new Date(2026, 10, 7)
  expect(url.searchParams.get('from')).toBe(from.toISOString())
  expect(url.searchParams.get('to')).toBe(to.toISOString())
})
