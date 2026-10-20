// @vitest-environment jsdom
import { widgets } from '@orbit/module-budget/web'
import type { WidgetDefinition } from '@orbit/widget-sdk'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'

afterEach(cleanup)

const find = (type: string): WidgetDefinition => widgets.find((w) => w.type === type)!
const mount = (type: string, config: Record<string, unknown> = {}) => {
  const { Component } = find(type)
  return render(<Component config={{ locale: 'en-US', ...config }} span={2} />)
}

describe('budget module', () => {
  it('offers five preview widgets with valid, unique types', () => {
    expect(widgets.map((w) => w.type)).toEqual([
      'budget.overview',
      'budget.cards',
      'budget.transactions',
      'budget.categories',
      'budget.bubbles',
    ])
    for (const w of widgets) {
      expect(w.type).toMatch(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/)
      expect(w.status).toBe('preview')
      // Every option has a default, so a fresh placement renders without saved settings.
      for (const option of w.options ?? []) expect(option.default).not.toBeUndefined()
    }
  })

  it('draws the overview and cards as accent cards, and the lists as plain ones', () => {
    expect(find('budget.overview').tone).toBe('accent')
    expect(find('budget.cards').tone).toBe('accent')
    expect(find('budget.bubbles').tone).toBe('accent')
    expect(find('budget.transactions').tone).toBeUndefined()
    expect(find('budget.categories').tone).toBeUndefined()
  })
})

describe('overview widget', () => {
  it('shows a whole year of months by default and a summary of the current one', () => {
    mount('budget.overview')
    const months = screen.getByRole('group', { name: 'Choose a month' })
    expect(within(months).getAllByRole('button')).toHaveLength(12)
    const thisMonth = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
      new Date(),
    )
    expect(screen.getByRole('status')).toHaveTextContent(`${thisMonth}: $`)
  })

  it.each([
    ['year', 12],
    ['half', 6],
    ['quarter', 3],
  ])('the %s period shows %i months', (period, count) => {
    mount('budget.overview', { period })
    expect(
      within(screen.getByRole('group', { name: 'Choose a month' })).getAllByRole('button'),
    ).toHaveLength(count)
  })

  it('falls back to a year for a period it does not know', () => {
    mount('budget.overview', { period: 'decade' })
    expect(
      within(screen.getByRole('group', { name: 'Choose a month' })).getAllByRole('button'),
    ).toHaveLength(12)
  })

  it('selects a month on click and says which one in the status line', async () => {
    const user = userEvent.setup()
    mount('budget.overview', { period: 'year' })
    const january = screen.getByRole('button', {
      name: new RegExp(`^January ${new Date().getFullYear()}$`),
    })
    expect(january).toHaveAttribute('aria-pressed', 'false')
    await user.click(january)
    expect(january).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('status')).toHaveTextContent(/^January \d{4}: \$/)
    // Exactly one month is selected at a time.
    const pressed = within(screen.getByRole('group', { name: 'Choose a month' }))
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') === 'true')
    expect(pressed).toHaveLength(1)
  })

  it('lets the viewer change the period without editing the dashboard', async () => {
    const user = userEvent.setup()
    mount('budget.overview', { period: 'quarter' })
    const months = () =>
      within(screen.getByRole('group', { name: 'Choose a month' })).getAllByRole('button')
    expect(months()).toHaveLength(3)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Period' }), 'year')
    expect(months()).toHaveLength(12)
  })

  it('formats in the chosen currency', () => {
    mount('budget.overview', { currency: 'EUR' })
    expect(screen.getByRole('status').textContent).toContain('€')
  })
})

describe('cards widget', () => {
  it('shows the balance and the limit, and cannot move money', () => {
    mount('budget.cards')
    expect(screen.getByText(/Credit limit: \$5,000\.00/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Deposit' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeDisabled()
    expect(screen.getByText('9286')).toBeInTheDocument()
  })
})

describe('transactions widget', () => {
  it('shows four rows by default, with negative amounts marked', () => {
    mount('budget.transactions')
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(4)
    expect(screen.getByText('-$59.99')).toBeInTheDocument()
    expect(screen.getByText('$187.50')).toBeInTheDocument()
  })

  it('shows as many rows as the setting says, within its limits', () => {
    mount('budget.transactions', { rows: 2 })
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    cleanup()
    mount('budget.transactions', { rows: 500 })
    expect(screen.getAllByRole('listitem')).toHaveLength(8)
  })

  it('expands to all rows and back', async () => {
    const user = userEvent.setup()
    mount('budget.transactions', { rows: 3 })
    const toggle = screen.getByRole('button', { name: 'View all' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(screen.getAllByRole('listitem')).toHaveLength(8)
    expect(screen.getByRole('button', { name: 'Show fewer' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    await user.click(screen.getByRole('button', { name: 'Show fewer' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('has no toggle when every row is already shown', () => {
    mount('budget.transactions', { rows: 8 })
    expect(screen.queryByRole('button', { name: /View all/ })).not.toBeInTheDocument()
  })
})

describe('categories widget', () => {
  it('shows the four biggest categories, biggest first', () => {
    mount('budget.categories')
    const tiles = screen.getAllByRole('listitem')
    expect(tiles).toHaveLength(4)
    expect(tiles[0]).toHaveTextContent('Groceries')
  })

  it('can be limited to the top two', () => {
    mount('budget.categories', { count: '2' })
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('says whether spending went up or down, in words as well as color', () => {
    mount('budget.categories')
    const groceries = screen.getAllByRole('listitem')[0]!
    expect(groceries).toHaveTextContent(/up 2\.46% from last month/)
    const clothes = screen
      .getAllByRole('listitem')
      .find((li) => li.textContent?.includes('Clothes'))
    expect(clothes).toHaveTextContent(/down 1\.84% from last month/)
  })
})

describe('bubbles widget', () => {
  it('writes every share as text, biggest first, so nothing depends on judging a size', () => {
    mount('budget.bubbles')
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(6)
    expect(items[0]).toHaveTextContent('Groceries')
    expect(items[0]).toHaveTextContent('32.8%')
    expect(items[5]).toHaveTextContent('Travel')
    expect(items[5]).toHaveTextContent('6.7%')
  })

  it('sizes bubbles by area, so the biggest share has factor 1 and the others its square root', () => {
    mount('budget.bubbles')
    const factor = (i: number) =>
      Number(screen.getAllByRole('listitem')[i]!.style.getPropertyValue('--k'))
    expect(factor(0)).toBeCloseTo(1, 10)
    expect(factor(1)).toBeCloseTo(Math.sqrt(16.1 / 32.8), 10)
    expect(factor(5)).toBeLessThan(factor(1))
  })

  it('offers a list view with the same data', () => {
    mount('budget.bubbles', { view: 'list' })
    expect(screen.getAllByRole('listitem')).toHaveLength(6)
    expect(screen.getByText('Health').closest('li')).toHaveTextContent('8.4%')
  })

  it('falls back to bubbles for a view it does not know', () => {
    const { container } = mount('budget.bubbles', { view: 'pie' })
    expect(container.querySelector('ul')?.className).toMatch(/bubbles/)
  })
})
