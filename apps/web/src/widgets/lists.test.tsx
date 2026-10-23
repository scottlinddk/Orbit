// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ME, dashboard, household } from '../test/fixtures.ts'
import { problem, stubApi } from '../test/fakeApi.ts'
import { renderApp } from '../test/render.tsx'

const item = (id: string, text: string, done = false, quantity?: string) => ({
  id,
  text,
  done,
  ...(quantity ? { quantity } : {}),
  position: 0,
  updatedBy: 'u-me',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

const groceries = (items = [item('i1', 'Milk', false, '2 l'), item('i2', 'Bread', true)]) => ({
  id: 'l1',
  householdId: 'h1',
  name: 'Groceries',
  kind: 'shopping' as const,
  readOnly: false,
  items,
})

const summaries = [
  { id: 'l1', name: 'Groceries', kind: 'shopping', readOnly: false, openCount: 1, itemCount: 2 },
  { id: 'l2', name: 'Hardware', kind: 'todo', readOnly: false, openCount: 0, itemCount: 0 },
]

const withWidget = (config: Record<string, unknown> = {}) =>
  dashboard({ widgets: [{ id: 'w1', type: 'lists.shopping', span: 1, config }] })

const baseApi = (config: Record<string, unknown> = {}) => ({
  'GET /api/v1/auth/me': { body: ME },
  'GET /api/v1/households': { body: { households: [household()] } },
  'GET /api/v1/households/h1': { body: household() },
  'GET /api/v1/dashboards/d1': { body: withWidget(config) },
  'GET /api/v1/planets/widgets': { body: { widgets: [] } },
  'GET /api/v1/households/h1/lists': { body: { lists: summaries } },
  'GET /api/v1/households/h1/lists/l1': { body: groceries() },
  'GET /api/v1/households/h1/lists/l2': { body: { ...groceries([]), id: 'l2', name: 'Hardware' } },
})

describe('shopping list widget', () => {
  it('shows the first list with open items first and what is still to get', async () => {
    stubApi(baseApi())
    renderApp('/d/d1')
    const list = await screen.findByRole('list', { name: 'Groceries' })
    const rows = within(list).getAllByRole('checkbox')
    expect(rows.map((r) => (r as HTMLInputElement).checked)).toEqual([false, true])
    expect(within(list).getByText('Milk')).toBeInTheDocument()
    expect(within(list).getByText(/2 l/)).toBeInTheDocument()
    expect(screen.getByText(/1 to get/)).toBeInTheDocument()
  })

  it('shows a mirrored list read only, and says when it is not up to date', async () => {
    stubApi({
      ...baseApi(),
      'GET /api/v1/households/h1/lists/l1': {
        body: {
          ...groceries(),
          readOnly: true,
          source: 'homeassistant',
          syncError: 'Home Assistant answered with status 500.',
        },
      },
    })
    renderApp('/d/d1')
    const list = await screen.findByRole('list', { name: 'Groceries' })
    for (const box of within(list).getAllByRole('checkbox')) expect(box).toBeDisabled()
    expect(screen.queryByLabelText('Add an item')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Clear/ })).not.toBeInTheDocument()
    expect(screen.getByText(/kept in another system/)).toBeInTheDocument()
    expect(
      screen.getByText(/Not up to date: Home Assistant answered with status 500\./),
    ).toBeInTheDocument()
  })

  it('shows the list chosen in the settings, and falls back when it is gone', async () => {
    stubApi(baseApi({ listId: 'l2' }))
    const chosen = renderApp('/d/d1')
    expect(await screen.findByRole('list', { name: 'Hardware' })).toBeInTheDocument()
    chosen.unmount()

    stubApi(baseApi({ listId: 'deleted' }))
    renderApp('/d/d1')
    expect(await screen.findByRole('list', { name: 'Groceries' })).toBeInTheDocument()
  })

  it('ticks an item off at once and keeps the server answer', async () => {
    let release: () => void = () => undefined
    const api = stubApi({
      ...baseApi(),
      'PATCH /api/v1/households/h1/lists/l1/items/i1': async () => {
        await new Promise<void>((resolve) => (release = resolve))
        return {
          body: groceries([item('i1', 'Milk', true, '2 l'), item('i2', 'Bread', true)]),
        }
      },
    })
    const { user } = renderApp('/d/d1')
    await user.click(await screen.findByRole('checkbox', { name: /Milk/ }))
    // The checkbox is already ticked while the server has not answered.
    expect(screen.getByRole('checkbox', { name: /Milk/ })).toBeChecked()
    release()
    await waitFor(() =>
      expect(api.sent('PATCH', '/api/v1/households/h1/lists/l1/items/i1')).toHaveLength(1),
    )
    expect(api.sent('PATCH', '/api/v1/households/h1/lists/l1/items/i1')[0]?.body).toEqual({
      done: true,
    })
  })

  it('puts the checkbox back and says why when the server refuses', async () => {
    stubApi({
      ...baseApi(),
      'PATCH /api/v1/households/h1/lists/l1/items/i1': problem(404, 'Not found', 'not-found'),
    })
    const { user } = renderApp('/d/d1')
    await user.click(await screen.findByRole('checkbox', { name: /Milk/ }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Milk/ })).not.toBeChecked())
  })

  it('adds an item and clears the completed ones', async () => {
    const api = stubApi({
      ...baseApi(),
      'POST /api/v1/households/h1/lists/l1/items': {
        status: 201,
        body: groceries([item('i1', 'Milk'), item('i2', 'Bread', true), item('i3', 'Eggs')]),
      },
      'POST /api/v1/households/h1/lists/l1/clear-completed': {
        body: groceries([item('i1', 'Milk')]),
      },
    })
    const { user } = renderApp('/d/d1')
    await user.type(await screen.findByLabelText('Add an item'), '  Eggs {Enter}')
    await screen.findByText('Eggs')
    expect(api.sent('POST', '/api/v1/households/h1/lists/l1/items')[0]?.body).toEqual({
      text: 'Eggs',
    })
    await user.click(screen.getByRole('button', { name: 'Clear 1 completed' }))
    await waitFor(() => expect(screen.queryByText('Bread')).not.toBeInTheDocument())
    expect(api.sent('POST', '/api/v1/households/h1/lists/l1/clear-completed')).toHaveLength(1)
  })

  it('invites you to create the first list when the household has none', async () => {
    const api = stubApi({
      ...baseApi(),
      'GET /api/v1/households/h1/lists': { body: { lists: [] } },
      'POST /api/v1/households/h1/lists': {
        status: 201,
        body: { ...groceries([]), name: 'Weekly shop' },
      },
    })
    const { user } = renderApp('/d/d1')
    await user.type(await screen.findByLabelText('Name of the new list'), 'Weekly shop{Enter}')
    await waitFor(() => expect(api.sent('POST', '/api/v1/households/h1/lists')).toHaveLength(1))
    expect(api.sent('POST', '/api/v1/households/h1/lists')[0]?.body).toEqual({
      name: 'Weekly shop',
      kind: 'shopping',
    })
  })

  it('lets an owner choose the list in the widget options', async () => {
    const api = stubApi({
      ...baseApi(),
      'PUT /api/v1/dashboards/d1/widgets/w1/config': {
        body: withWidget({ listId: 'l2' }),
      },
    })
    const { user } = renderApp('/d/d1')
    await user.click(await screen.findByRole('button', { name: 'Edit layout' }))
    await user.click(await screen.findByRole('button', { name: 'Options for Shopping list' }))
    const select = await screen.findByLabelText('List')
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['First list', 'Groceries', 'Hardware'])
    await user.selectOptions(select, 'l2')
    await waitFor(() =>
      expect(api.sent('PUT', '/api/v1/dashboards/d1/widgets/w1/config')).toHaveLength(1),
    )
    expect(api.sent('PUT', '/api/v1/dashboards/d1/widgets/w1/config')[0]?.body).toEqual({
      config: { listId: 'l2' },
    })
  })
})
