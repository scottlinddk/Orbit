// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ME, dashboard, household } from '../test/fixtures.ts'
import { problem, stubApi } from '../test/fakeApi.ts'
import { renderApp } from '../test/render.tsx'

const pad = (n: number) => String(n).padStart(2, '0')
const dayOffset = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const entries = [
  {
    id: 'm1',
    date: dayOffset(0),
    type: 'dinner',
    title: 'Chili sin carne',
    recipe: { connectionId: 'c1', ref: 'chili', name: 'Chili sin carne' },
  },
  { id: 'm2', date: dayOffset(0), type: 'breakfast', title: 'Oats', note: 'with honey' },
  { id: 'm3', date: dayOffset(1), type: 'lunch', title: 'Leftovers' },
]

const plan = (over: Record<string, unknown> = {}) => ({
  entries,
  sources: [{ sourceId: 'c1:mealplan.mealplan', name: 'Meal plan', ok: true, fetchedAt: 'now' }],
  ...over,
})

const baseApi = (mealPlan: unknown = plan()) => ({
  'GET /api/v1/auth/me': { body: ME },
  'GET /api/v1/households': { body: { households: [household()] } },
  'GET /api/v1/households/h1': { body: household() },
  'GET /api/v1/dashboards/d1': {
    body: dashboard({ widgets: [{ id: 'w1', type: 'meals.plan', span: 2, config: {} }] }),
  },
  'GET /api/v1/planets/widgets': { body: { widgets: [] } },
  'GET /api/v1/households/h1/meals': { body: mealPlan },
})

describe('meal plan widget', () => {
  it('shows the days in order, breakfast before dinner, with today named', async () => {
    stubApi(baseApi())
    renderApp('/d/d1')
    const today = await screen.findByRole('region', { name: 'Today' })
    const rows = within(today).getAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Oats'),
      expect.stringContaining('Chili sin carne'),
    ])
    expect(within(today).getByText(/with honey/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Tomorrow' })).toBeInTheDocument()
  })

  it('opens the recipe with its ingredients and steps on request', async () => {
    const api = stubApi({
      ...baseApi(),
      'GET /api/v1/households/h1/meals/recipes/c1/chili': {
        body: {
          name: 'Chili sin carne',
          servings: 4,
          ingredients: ['2 cans kidney beans', '1 onion'],
          instructions: ['Chop.', 'Simmer.'],
        },
      },
    })
    const { user } = renderApp('/d/d1')
    await user.click(
      await screen.findByRole('button', { name: 'Show the recipe for Chili sin carne' }),
    )
    const ingredients = await screen.findByRole('region', { name: 'Ingredients' })
    expect(within(ingredients).getByText('2 cans kidney beans')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Steps' })).toBeInTheDocument()
    expect(screen.getByText('Serves 4')).toBeInTheDocument()
    expect(api.sent('GET', '/api/v1/households/h1/meals/recipes/c1/chili')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Hide the recipe for Chili sin carne' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Ingredients' })).toBeNull())
  })

  it('explains a recipe that cannot be loaded', async () => {
    stubApi({
      ...baseApi(),
      'GET /api/v1/households/h1/meals/recipes/c1/chili': problem(
        422,
        'The recipe could not be read. Mealie refused the API token.',
      ),
    })
    const { user } = renderApp('/d/d1')
    await user.click(
      await screen.findByRole('button', { name: 'Show the recipe for Chili sin carne' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Mealie refused the API token')
  })

  it('says how to connect Mealie when nothing is connected', async () => {
    stubApi(baseApi(plan({ entries: [], sources: [] })))
    renderApp('/d/d1')
    expect(await screen.findByText(/Connect Mealie to see/)).toBeInTheDocument()
  })

  it('says so when nothing is planned', async () => {
    stubApi(baseApi(plan({ entries: [] })))
    renderApp('/d/d1')
    expect(await screen.findByText('Nothing planned.')).toBeInTheDocument()
  })

  it('keeps showing the last meals when the plan could not be refreshed, and says so', async () => {
    stubApi(
      baseApi(
        plan({
          sources: [
            { sourceId: 'c1:mealplan.mealplan', name: 'Meal plan', ok: false, fetchedAt: 'old' },
          ],
        }),
      ),
    )
    renderApp('/d/d1')
    expect(await screen.findByText(/Meal plan could not be refreshed/)).toBeInTheDocument()
    expect(screen.getByText('Oats')).toBeInTheDocument()
  })

  it('shows an error instead of an empty week when the request fails', async () => {
    stubApi({
      ...baseApi(),
      'GET /api/v1/households/h1/meals': problem(500, 'Boom'),
    })
    renderApp('/d/d1')
    expect(await screen.findByText('The meal plan could not be loaded.')).toBeInTheDocument()
  })
})
