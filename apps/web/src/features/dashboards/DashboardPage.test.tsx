// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ME, dashboard, household, memberOnlyHousehold, widget } from '../../test/fixtures.ts'
import { problem, stubApi } from '../../test/fakeApi.ts'
import { renderApp } from '../../test/render.tsx'

const three = () =>
  dashboard({
    widgets: [
      widget('w1', 'calendar.today'),
      widget('w2', 'lists.shopping'),
      widget('w3', 'calendar.agenda', 2),
    ],
  })

const baseApi = (d = three(), h = household()) => ({
  'GET /api/v1/auth/me': { body: ME },
  'GET /api/v1/households': { body: { households: [h] } },
  'GET /api/v1/households/h1': { body: h },
  'GET /api/v1/dashboards/d1': { body: d },
  'GET /api/v1/planets/widgets': { body: { widgets: [] } },
  'GET /api/v1/households/h1/lists': { body: { lists: [] } },
})

const titles = () =>
  within(screen.getByRole('list', { name: 'Week widgets' }))
    .getAllByRole('heading', { level: 2 })
    .map((h) => h.textContent)

describe('dashboard page', () => {
  it('shows widgets in the order the server sent them', async () => {
    stubApi(baseApi())
    renderApp('/d/d1')
    await screen.findByRole('heading', { name: 'Week', level: 1 })
    const grid = screen.getByRole('list', { name: 'Week widgets' })
    const cards = within(grid).getAllByRole('article')
    expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual([
      'Today',
      'Shopping list',
      'Agenda',
    ])
  })

  it('lays widgets out with the dashboard columns and each widget span', async () => {
    stubApi(
      baseApi(
        dashboard({
          columns: 2,
          widgets: [widget('w1', 'calendar.today'), widget('w3', 'calendar.agenda', 2)],
        }),
      ),
    )
    renderApp('/d/d1')
    const grid = await screen.findByRole('list', { name: 'Week widgets' })
    expect(grid.style.getPropertyValue('--columns')).toBe('2')
    const cells = within(grid).getAllByRole('listitem')
    expect(cells.map((c) => c.style.getPropertyValue('--span'))).toEqual(['1', '2'])
  })

  it('marks preview widgets', async () => {
    stubApi(baseApi(dashboard({ widgets: [widget('w1', 'budget.balance')] })))
    renderApp('/d/d1')
    await screen.findByRole('heading', { name: 'Week', level: 1 })
    // Budget still shows sample data. The agenda and the shopping list are real.
    expect(screen.getAllByText('Preview')).toHaveLength(1)
  })

  describe('calendar widgets', () => {
    // Local dates, because the widgets decide what today is by the viewer's clock.
    const localDate = (offset: number) =>
      new Intl.DateTimeFormat('en-CA').format(new Date(Date.now() + offset * 86_400_000))
    const day = localDate(0)
    const events = {
      events: [
        {
          kind: 'all-day',
          id: 'e1',
          sourceId: 's1',
          title: 'School holiday',
          startDate: day,
          endDate: localDate(1),
          isRecurring: false,
          isOverride: false,
        },
      ],
      sources: [{ sourceId: 's1', ok: true, fetchedAt: '2026-01-01T00:00:00.000Z' }],
    }
    const sources = [
      { id: 's1', name: 'Family', color: '#3366ff', host: 'cal.example.com', createdAt: 'x' },
    ]

    it('show events from the household calendars, and ask for them once', async () => {
      const stub = stubApi({
        ...baseApi(),
        'GET /api/v1/households/h1/calendar/events': { body: events },
        'GET /api/v1/households/h1/calendar/sources': { body: { sources } },
      })
      renderApp('/d/d1')
      const agenda = await screen.findByRole('article', { name: 'Agenda' })
      expect(await within(agenda).findByText('School holiday')).toBeInTheDocument()
      const today = screen.getByRole('article', { name: 'Today' })
      expect(await within(today).findByText('School holiday')).toBeInTheDocument()
      expect(stub.sent('GET', '/api/v1/households/h1/calendar/events')).toHaveLength(1)
    })

    it('say how to connect a calendar when there is none', async () => {
      stubApi(baseApi())
      renderApp('/d/d1')
      const agenda = await screen.findByRole('article', { name: 'Agenda' })
      expect(await within(agenda).findByText(/Connect a calendar/)).toBeInTheDocument()
    })

    it('say which calendar could not be refreshed and keep showing its events', async () => {
      stubApi({
        ...baseApi(),
        'GET /api/v1/households/h1/calendar/events': {
          body: {
            ...events,
            sources: [{ sourceId: 's1', ok: false, fetchedAt: null, error: 'Down.' }],
          },
        },
        'GET /api/v1/households/h1/calendar/sources': { body: { sources } },
      })
      renderApp('/d/d1')
      const agenda = await screen.findByRole('article', { name: 'Agenda' })
      expect(await within(agenda).findByText('School holiday')).toBeInTheDocument()
      expect(within(agenda).getByRole('status')).toHaveTextContent('Family could not be refreshed')
    })

    it('do not ask for events when the dashboard has no calendar widget', async () => {
      const stub = stubApi(baseApi(dashboard({ widgets: [widget('w2', 'lists.shopping')] })))
      renderApp('/d/d1')
      await screen.findByRole('article', { name: 'Shopping list' })
      expect(stub.sent('GET', '/api/v1/households/h1/calendar/events')).toHaveLength(0)
    })
  })

  it('shows an empty state with a hint for owners and a plainer one for members', async () => {
    stubApi(baseApi(dashboard()))
    const owner = renderApp('/d/d1')
    expect(await screen.findByText(/This dashboard is empty/)).toBeInTheDocument()
    owner.unmount()

    stubApi(baseApi(dashboard(), memberOnlyHousehold()))
    renderApp('/d/d1')
    expect(await screen.findByText(/Nothing here yet/)).toBeInTheDocument()
  })

  it('gives members no way to edit', async () => {
    stubApi(baseApi(three(), memberOnlyHousehold()))
    renderApp('/d/d1')
    await screen.findByRole('heading', { name: 'Week', level: 1 })
    expect(screen.queryByRole('button', { name: 'Edit layout' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Move|Remove/ })).not.toBeInTheDocument()
  })

  it('keeps unknown widget types on the dashboard with an explanation', async () => {
    stubApi(baseApi(dashboard({ widgets: [widget('w1', 'ghost.widget')] })))
    renderApp('/d/d1')
    expect(await screen.findByText(/Unknown widget “ghost.widget”/)).toBeInTheDocument()
  })

  it('says "not found or no access" for a 404 and offers no retry', async () => {
    stubApi({
      'GET /api/v1/auth/me': { body: ME },
      'GET /api/v1/households': { body: { households: [] } },
      'GET /api/v1/dashboards/d1': problem(404, 'Not found', 'not-found'),
    })
    renderApp('/d/d1')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Not found, or you do not have access',
    )
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  describe('editing as an owner', () => {
    it('only shows controls after choosing Edit', async () => {
      stubApi(baseApi())
      const { user } = renderApp('/d/d1')
      const edit = await screen.findByRole('button', { name: 'Edit layout' })
      expect(screen.queryByRole('button', { name: 'Remove Today' })).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Drag Today to reorder' }),
      ).not.toBeInTheDocument()
      await user.click(edit)
      expect(await screen.findByRole('button', { name: 'Remove Today' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Drag Today to reorder' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Done' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('adds a widget with its default span and announces it', async () => {
      const added = dashboard({ widgets: [widget('w9', 'calendar.agenda', 2)] })
      const api = stubApi({
        ...baseApi(dashboard()),
        'POST /api/v1/dashboards/d1/widgets': { status: 201, body: added },
      })
      const { user } = renderApp('/d/d1')
      await user.click(await screen.findByRole('button', { name: 'Edit layout' }))
      await user.click(await screen.findByRole('button', { name: 'Add Agenda' }))
      expect(await screen.findByRole('article', { name: 'Agenda' })).toBeInTheDocument()
      expect(api.sent('POST', '/api/v1/dashboards/d1/widgets')[0]?.body).toEqual({
        type: 'calendar.agenda',
        span: 2,
      })
      expect(screen.getAllByRole('status').some((s) => s.textContent === 'Added Agenda')).toBe(true)
    })

    it('never asks for a span wider than the dashboard', async () => {
      const api = stubApi({
        ...baseApi(dashboard({ columns: 1 })),
        'POST /api/v1/dashboards/d1/widgets': {
          status: 201,
          body: dashboard({ columns: 1, widgets: [widget('w9', 'calendar.agenda', 1)] }),
        },
      })
      const { user } = renderApp('/d/d1')
      await user.click(await screen.findByRole('button', { name: 'Edit layout' }))
      await user.click(await screen.findByRole('button', { name: 'Add Agenda' }))
      await screen.findByRole('article', { name: 'Agenda' })
      expect(api.sent('POST', '/api/v1/dashboards/d1/widgets')[0]?.body).toEqual({
        type: 'calendar.agenda',
        span: 1,
      })
    })

    it('moves a widget one place and shows the server order', async () => {
      const moved = dashboard({
        widgets: [
          widget('w2', 'lists.shopping'),
          widget('w1', 'calendar.today'),
          widget('w3', 'calendar.agenda', 2),
        ],
      })
      const api = stubApi({
        ...baseApi(),
        'PUT /api/v1/dashboards/d1/widgets/w1/position': { body: moved },
      })
      const { user } = renderApp('/d/d1')
      await user.click(await screen.findByRole('button', { name: 'Edit layout' }))
      await user.click(await screen.findByRole('button', { name: 'Options for Today' }))
      await user.click(await screen.findByRole('button', { name: 'Move Today later' }))
      await screen.findByText('Moved Today to position 2 of 3')
      expect(api.sent('PUT', '/api/v1/dashboards/d1/widgets/w1/position')[0]?.body).toEqual({
        toIndex: 1,
      })
      expect(titles().slice(-3)).toEqual(['Shopping list', 'Today', 'Agenda'])
    })

    it('disables moves that go past either end', async () => {
      stubApi(baseApi())
      const { user } = renderApp('/d/d1')
      await user.click(await screen.findByRole('button', { name: 'Edit layout' }))
      await user.click(await screen.findByRole('button', { name: 'Options for Today' }))
      expect(await screen.findByRole('button', { name: 'Move Today earlier' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Move Today later' })).toBeEnabled()
      await user.click(screen.getByRole('button', { name: 'Options for Agenda' }))
      expect(await screen.findByRole('button', { name: 'Move Agenda later' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Move Agenda earlier' })).toBeEnabled()
    })

    it('removes a widget', async () => {
      const after = dashboard({ widgets: [widget('w1', 'calendar.today')] })
      const api = stubApi({
        ...baseApi(),
        'DELETE /api/v1/dashboards/d1/widgets/w3': { body: after },
      })
      const { user } = renderApp('/d/d1')
      await user.click(await screen.findByRole('button', { name: 'Edit layout' }))
      await user.click(await screen.findByRole('button', { name: 'Remove Agenda' }))
      await screen.findByText('Removed Agenda')
      expect(api.sent('DELETE', '/api/v1/dashboards/d1/widgets/w3')).toHaveLength(1)
      expect(screen.queryByRole('article', { name: 'Agenda' })).not.toBeInTheDocument()
    })

    it('changes the number of columns', async () => {
      const api = stubApi({
        ...baseApi(),
        'PUT /api/v1/dashboards/d1/columns': {
          body: dashboard({ columns: 2, widgets: three().widgets }),
        },
      })
      const { user } = renderApp('/d/d1')
      await user.click(await screen.findByRole('button', { name: 'Edit layout' }))
      await user.selectOptions(await screen.findByLabelText('Columns'), '2')
      expect(
        (await screen.findByRole('list', { name: 'Week widgets' })).style.getPropertyValue(
          '--columns',
        ),
      ).toBe('2')
      expect(api.sent('PUT', '/api/v1/dashboards/d1/columns')[0]?.body).toEqual({ columns: 2 })
    })

    it('renames only when the name changed', async () => {
      const api = stubApi({
        ...baseApi(),
        'PUT /api/v1/dashboards/d1/name': {
          body: dashboard({ name: 'Kitchen', widgets: three().widgets }),
        },
      })
      const { user } = renderApp('/d/d1')
      await user.click(await screen.findByRole('button', { name: 'Edit layout' }))
      expect(await screen.findByRole('button', { name: 'Rename' })).toBeDisabled()
      const field = screen.getByLabelText('Name')
      await user.clear(field)
      await user.type(field, 'Kitchen')
      await user.click(screen.getByRole('button', { name: 'Rename' }))
      expect(await screen.findByRole('heading', { name: 'Kitchen', level: 1 })).toBeInTheDocument()
      expect(api.sent('PUT', '/api/v1/dashboards/d1/name')[0]?.body).toEqual({ name: 'Kitchen' })
    })

    it('shows the server message when a change is refused', async () => {
      stubApi({
        ...baseApi(),
        'PUT /api/v1/dashboards/d1/widgets/w1/position': problem(
          422,
          'Index is outside the dashboard',
        ),
      })
      const { user } = renderApp('/d/d1')
      await user.click(await screen.findByRole('button', { name: 'Edit layout' }))
      await user.click(await screen.findByRole('button', { name: 'Options for Today' }))
      await user.click(await screen.findByRole('button', { name: 'Move Today later' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Index is outside the dashboard')
    })

    it('selects a widget to show its options, and closes them again', async () => {
      stubApi(baseApi())
      const { user } = renderApp('/d/d1')
      await user.click(await screen.findByRole('button', { name: 'Edit layout' }))
      expect(await screen.findByText(/Select a widget to change/)).toBeInTheDocument()
      const options = await screen.findByRole('button', { name: 'Options for Agenda' })
      await user.click(options)
      expect(options).toHaveAttribute('aria-pressed', 'true')
      expect(await screen.findByRole('heading', { name: 'Agenda options' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Close options' }))
      expect(screen.queryByRole('heading', { name: 'Agenda options' })).not.toBeInTheDocument()
    })

    it('changes the width of the selected widget', async () => {
      const api = stubApi({
        ...baseApi(),
        'PUT /api/v1/dashboards/d1/widgets/w1/span': {
          body: dashboard({
            widgets: [
              widget('w1', 'calendar.today', 2),
              widget('w2', 'lists.shopping'),
              widget('w3', 'calendar.agenda', 2),
            ],
          }),
        },
      })
      const { user } = renderApp('/d/d1')
      await user.click(await screen.findByRole('button', { name: 'Edit layout' }))
      await user.click(await screen.findByRole('button', { name: 'Options for Today' }))
      const group = await screen.findByRole('group', { name: 'Width in columns' })
      expect(within(group).getByRole('radio', { name: '1' })).toBeChecked()
      await user.click(within(group).getByRole('radio', { name: '2' }))
      await screen.findByText('Today is now 2 columns wide')
      expect(api.sent('PUT', '/api/v1/dashboards/d1/widgets/w1/span')[0]?.body).toEqual({
        span: 2,
      })
      const cells = within(screen.getByRole('list', { name: 'Week widgets' })).getAllByRole(
        'listitem',
      )
      expect(cells[0]?.style.getPropertyValue('--span')).toBe('2')
    })

    it('resizes from the keyboard with the width handle', async () => {
      const api = stubApi({
        ...baseApi(),
        'PUT /api/v1/dashboards/d1/widgets/w1/span': {
          body: dashboard({ widgets: [widget('w1', 'calendar.today', 2)] }),
        },
      })
      const { user } = renderApp('/d/d1')
      await user.click(await screen.findByRole('button', { name: 'Edit layout' }))
      const handle = await screen.findByRole('slider', { name: 'Width of Today' })
      expect(handle).toHaveAttribute('aria-valuenow', '1')
      expect(handle).toHaveAttribute('aria-valuemax', '3')
      expect(handle).toHaveAttribute('aria-valuetext', '1 of 3 columns')
      handle.focus()
      await user.keyboard('{ArrowRight}')
      await waitFor(() =>
        expect(api.sent('PUT', '/api/v1/dashboards/d1/widgets/w1/span')).toHaveLength(1),
      )
      expect(api.sent('PUT', '/api/v1/dashboards/d1/widgets/w1/span')[0]?.body).toEqual({
        span: 2,
      })
    })

    it('does not resize past either end with the keyboard', async () => {
      const api = stubApi(baseApi())
      const { user } = renderApp('/d/d1')
      await user.click(await screen.findByRole('button', { name: 'Edit layout' }))
      const handle = await screen.findByRole('slider', { name: 'Width of Today' })
      handle.focus()
      await user.keyboard('{ArrowLeft}')
      expect(api.sent('PUT', '/api/v1/dashboards/d1/widgets/w1/span')).toHaveLength(0)
    })

    it('saves a widget setting when the person chooses it', async () => {
      const d = dashboard({ widgets: [widget('w1', 'budget.transactions', 2)] })
      const api = stubApi({
        ...baseApi(d),
        'PUT /api/v1/dashboards/d1/widgets/w1/config': {
          body: dashboard({
            widgets: [{ ...widget('w1', 'budget.transactions', 2), config: { currency: 'DKK' } }],
          }),
        },
      })
      const { user } = renderApp('/d/d1')
      await user.click(await screen.findByRole('button', { name: 'Edit layout' }))
      await user.click(
        await screen.findByRole('button', { name: 'Options for Recent transactions' }),
      )
      await user.selectOptions(await screen.findByLabelText('Currency'), 'DKK')
      await screen.findByText('Updated Recent transactions settings')
      expect(api.sent('PUT', '/api/v1/dashboards/d1/widgets/w1/config')[0]?.body).toEqual({
        config: { currency: 'DKK' },
      })
    })

    it('saves a number setting on blur, clamped, and leaves out defaults', async () => {
      const d = dashboard({ widgets: [widget('w1', 'budget.transactions', 2)] })
      const api = stubApi({
        ...baseApi(d),
        'PUT /api/v1/dashboards/d1/widgets/w1/config': { body: d },
      })
      const { user } = renderApp('/d/d1')
      await user.click(await screen.findByRole('button', { name: 'Edit layout' }))
      await user.click(
        await screen.findByRole('button', { name: 'Options for Recent transactions' }),
      )
      const rows = await screen.findByLabelText('Rows')
      expect(rows).toHaveValue(4)
      await user.clear(rows)
      await user.type(rows, '99')
      expect(api.sent('PUT', '/api/v1/dashboards/d1/widgets/w1/config')).toHaveLength(0)
      await user.tab()
      await waitFor(() =>
        expect(api.sent('PUT', '/api/v1/dashboards/d1/widgets/w1/config')).toHaveLength(1),
      )
      // The widget allows at most 8 rows.
      expect(api.sent('PUT', '/api/v1/dashboards/d1/widgets/w1/config')[0]?.body).toEqual({
        config: { rows: 8 },
      })
    })

    it('says so when the selected widget has no settings', async () => {
      stubApi(baseApi())
      const { user } = renderApp('/d/d1')
      await user.click(await screen.findByRole('button', { name: 'Edit layout' }))
      await user.click(await screen.findByRole('button', { name: 'Options for Today' }))
      expect(await screen.findByText('This widget has no settings.')).toBeInTheDocument()
    })

    it('shows a moved card in its new place at once, and puts it back if the server refuses', async () => {
      let refuse: () => void = () => {}
      const held = new Promise<void>((resolve) => (refuse = resolve))
      stubApi({
        ...baseApi(),
        'PUT /api/v1/dashboards/d1/widgets/w1/position': async () => {
          await held
          return problem(422, 'Index is outside the dashboard')
        },
      })
      const { user } = renderApp('/d/d1')
      await user.click(await screen.findByRole('button', { name: 'Edit layout' }))
      await user.click(await screen.findByRole('button', { name: 'Options for Today' }))
      await user.click(await screen.findByRole('button', { name: 'Move Today later' }))
      // The request has not been answered yet, and the new order is already on screen.
      await waitFor(() => expect(titles()).toEqual(['Shopping list', 'Today', 'Agenda']))
      refuse()
      expect(await screen.findByRole('alert')).toHaveTextContent('Index is outside the dashboard')
      expect(titles()).toEqual(['Today', 'Shopping list', 'Agenda'])
    })

    it('asks for confirmation before deleting, then returns to the household', async () => {
      const api = stubApi({
        ...baseApi(),
        'DELETE /api/v1/dashboards/d1': { status: 204 },
        'GET /api/v1/households/h1/dashboards': { body: { dashboards: [] } },
      })
      const { user } = renderApp('/d/d1')
      await user.click(await screen.findByRole('button', { name: 'Edit layout' }))
      await user.click(await screen.findByRole('button', { name: 'Delete dashboard' }))
      expect(api.sent('DELETE', '/api/v1/dashboards/d1')).toHaveLength(0)
      await user.click(screen.getByRole('button', { name: 'Yes, delete it' }))
      expect(await screen.findByRole('heading', { name: 'Home', level: 1 })).toBeInTheDocument()
      expect(api.sent('DELETE', '/api/v1/dashboards/d1')).toHaveLength(1)
    })

    it('can back out of deleting', async () => {
      const api = stubApi(baseApi())
      const { user } = renderApp('/d/d1')
      await user.click(await screen.findByRole('button', { name: 'Edit layout' }))
      await user.click(await screen.findByRole('button', { name: 'Delete dashboard' }))
      await user.click(screen.getByRole('button', { name: 'Keep it' }))
      expect(screen.getByRole('button', { name: 'Delete dashboard' })).toBeInTheDocument()
      expect(api.sent('DELETE', '/api/v1/dashboards/d1')).toHaveLength(0)
    })
  })

  it('signs the user out when any request reports the session ended', async () => {
    stubApi({
      'GET /api/v1/auth/me': (() => {
        let first = true
        return () => {
          if (first) {
            first = false
            return { body: ME }
          }
          return problem(401, 'Sign in required', 'unauthenticated')
        }
      })(),
      'GET /api/v1/households': { body: { households: [] } },
      'GET /api/v1/dashboards/d1': problem(401, 'Sign in required', 'unauthenticated'),
    })
    renderApp('/d/d1')
    expect(await screen.findByRole('heading', { name: 'Sign in to Orbit' })).toBeInTheDocument()
  })

  describe('Planet widgets', () => {
    const planet = {
      type: 'planet.dev.orbit.hello',
      planetId: 'dev.orbit.hello',
      title: 'Hello',
      description: 'Greets.',
      defaultSpan: 1,
      options: [],
    }

    it('draws a Planet in a sandboxed frame with no scripts and says when the data is old', async () => {
      stubApi({
        ...baseApi(dashboard({ widgets: [widget('w1', 'planet.dev.orbit.hello')] })),
        'GET /api/v1/planets/widgets': { body: { widgets: [planet] } },
        'GET /api/v1/dashboards/d1/widgets/w1/planet': {
          body: {
            html: '<p>Hello, Sam</p><script>steal()</script>',
            stale: true,
            error: 'The request took too long.',
          },
        },
      })
      renderApp('/d/d1')
      const frame = await screen.findByTitle('Hello')
      // An empty sandbox attribute is the strictest one: no scripts, no forms, opaque origin.
      expect(frame).toHaveAttribute('sandbox', '')
      expect(frame.getAttribute('srcdoc')).toContain('<p>Hello, Sam</p>')
      expect(
        await screen.findByText(/Showing older data. The request took too long./),
      ).toBeVisible()
    })

    it('keeps an unknown Planet on the dashboard and says it cannot be shown', async () => {
      stubApi(baseApi(dashboard({ widgets: [widget('w1', 'planet.dev.gone.x')] })))
      renderApp('/d/d1')
      expect(await screen.findByText(/Unknown widget “planet.dev.gone.x”/)).toBeVisible()
    })
  })
})
