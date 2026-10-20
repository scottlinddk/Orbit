// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
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
})

const titles = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)

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
    stubApi(baseApi())
    renderApp('/d/d1')
    await screen.findByRole('heading', { name: 'Week', level: 1 })
    expect(screen.getAllByText('Preview')).toHaveLength(2)
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
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
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
      const edit = await screen.findByRole('button', { name: 'Edit' })
      expect(screen.queryByRole('button', { name: 'Remove Today' })).not.toBeInTheDocument()
      await user.click(edit)
      expect(screen.getByRole('button', { name: 'Remove Today' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Done' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('adds a widget with its default span and announces it', async () => {
      const added = dashboard({ widgets: [widget('w9', 'calendar.agenda', 2)] })
      const api = stubApi({
        ...baseApi(dashboard()),
        'POST /api/v1/dashboards/d1/widgets': { status: 201, body: added },
      })
      const { user } = renderApp('/d/d1')
      await user.click(await screen.findByRole('button', { name: 'Edit' }))
      await user.click(screen.getByRole('button', { name: 'Add Agenda' }))
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
      await user.click(await screen.findByRole('button', { name: 'Edit' }))
      await user.click(screen.getByRole('button', { name: 'Add Agenda' }))
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
      await user.click(await screen.findByRole('button', { name: 'Edit' }))
      await user.click(screen.getByRole('button', { name: 'Move Today later' }))
      await screen.findByText('Moved Today to position 2 of 3')
      expect(api.sent('PUT', '/api/v1/dashboards/d1/widgets/w1/position')[0]?.body).toEqual({
        toIndex: 1,
      })
      expect(titles().slice(-3)).toEqual(['Shopping list', 'Today', 'Agenda'])
    })

    it('disables moves that go past either end', async () => {
      stubApi(baseApi())
      const { user } = renderApp('/d/d1')
      await user.click(await screen.findByRole('button', { name: 'Edit' }))
      expect(screen.getByRole('button', { name: 'Move Today earlier' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Move Agenda later' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Move Today later' })).toBeEnabled()
    })

    it('removes a widget', async () => {
      const after = dashboard({ widgets: [widget('w1', 'calendar.today')] })
      const api = stubApi({
        ...baseApi(),
        'DELETE /api/v1/dashboards/d1/widgets/w3': { body: after },
      })
      const { user } = renderApp('/d/d1')
      await user.click(await screen.findByRole('button', { name: 'Edit' }))
      await user.click(screen.getByRole('button', { name: 'Remove Agenda' }))
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
      await user.click(await screen.findByRole('button', { name: 'Edit' }))
      await user.selectOptions(screen.getByLabelText('Columns'), '2')
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
      await user.click(await screen.findByRole('button', { name: 'Edit' }))
      expect(screen.getByRole('button', { name: 'Rename' })).toBeDisabled()
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
      await user.click(await screen.findByRole('button', { name: 'Edit' }))
      await user.click(screen.getByRole('button', { name: 'Move Today later' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Index is outside the dashboard')
    })

    it('asks for confirmation before deleting, then returns to the household', async () => {
      const api = stubApi({
        ...baseApi(),
        'DELETE /api/v1/dashboards/d1': { status: 204 },
        'GET /api/v1/households/h1/dashboards': { body: { dashboards: [] } },
      })
      const { user } = renderApp('/d/d1')
      await user.click(await screen.findByRole('button', { name: 'Edit' }))
      await user.click(screen.getByRole('button', { name: 'Delete dashboard' }))
      expect(api.sent('DELETE', '/api/v1/dashboards/d1')).toHaveLength(0)
      await user.click(screen.getByRole('button', { name: 'Yes, delete it' }))
      expect(await screen.findByRole('heading', { name: 'Home', level: 1 })).toBeInTheDocument()
      expect(api.sent('DELETE', '/api/v1/dashboards/d1')).toHaveLength(1)
    })

    it('can back out of deleting', async () => {
      const api = stubApi(baseApi())
      const { user } = renderApp('/d/d1')
      await user.click(await screen.findByRole('button', { name: 'Edit' }))
      await user.click(screen.getByRole('button', { name: 'Delete dashboard' }))
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
})
