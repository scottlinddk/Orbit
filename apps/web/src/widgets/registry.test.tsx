// @vitest-environment jsdom
import { defineWidget, type WidgetDefinition } from '@orbit/widget-sdk'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { WidgetBody } from './WidgetBody.tsx'
import { buildRegistry, registry } from './registry.ts'

afterEach(cleanup)

const make = (type: string, Component: WidgetDefinition['Component'] = () => <p>ok</p>) =>
  defineWidget({ type, title: type, description: '', defaultSpan: 1, status: 'stable', Component })

describe('registry', () => {
  it('collects the built-in widgets with unique types', () => {
    const types = registry.all.map((w) => w.type)
    expect(new Set(types).size).toBe(types.length)
    expect(types).toEqual(
      expect.arrayContaining(['calendar.today', 'calendar.agenda', 'lists.shopping']),
    )
  })

  it('only offers valid widget types that the API accepts', () => {
    for (const { type } of registry.all)
      expect(type).toMatch(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/)
  })

  it('refuses two widgets with the same type', () => {
    expect(() => buildRegistry([make('a.b'), make('a.b')])).toThrow(/Duplicate widget type: a.b/)
  })

  it('finds a widget by type', () => {
    expect(registry.find('calendar.today')?.title).toBe('Today')
    expect(registry.find('nope.nope')).toBeUndefined()
  })
})

describe('WidgetBody', () => {
  const placement = { id: 'w', type: 'x.y', span: 1, config: {} }

  it('explains an unknown widget instead of failing', () => {
    render(<WidgetBody placement={placement} definition={undefined} />)
    expect(screen.getByText(/Unknown widget “x.y”/)).toBeInTheDocument()
  })

  it('contains a crashing widget', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Crash = () => {
      throw new Error('boom')
    }
    render(<WidgetBody placement={placement} definition={make('x.y', Crash)} />)
    expect(screen.getByRole('alert')).toHaveTextContent('could not be shown')
    spy.mockRestore()
  })

  it('passes config and span to the widget and nothing else', () => {
    const seen: unknown[] = []
    const Spy = (props: object) => {
      seen.push(props)
      return null
    }
    render(
      <WidgetBody
        placement={{ ...placement, span: 2, config: { a: 1 } }}
        definition={make('x.y', Spy)}
      />,
    )
    expect(seen).toEqual([{ config: { a: 1 }, span: 2 }])
  })
})
