// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ME, household } from '../../test/fixtures.ts'
import { stubApi } from '../../test/fakeApi.ts'
import { renderApp } from '../../test/render.tsx'
import { findPreset } from '../presets.ts'
import { STORAGE_KEY, parseTheme } from '../storage.ts'

const ensureFont = vi.fn<(id: string) => Promise<void>>(() => Promise.resolve())
vi.mock('../fonts/loader.ts', () => ({ ensureFont: (id: string) => ensureFont(id) }))

const root = document.documentElement
const cssVar = (name: string) => root.style.getPropertyValue(name)
const saved = () => parseTheme(localStorage.getItem(STORAGE_KEY) ?? '')

const open = async () => {
  stubApi({
    'GET /api/v1/auth/me': { body: ME },
    'GET /api/v1/households': { body: { households: [household()] } },
  })
  const view = renderApp('/appearance')
  await screen.findByRole('heading', { name: 'Appearance', level: 1 })
  return view
}

beforeEach(() => {
  localStorage.clear()
  root.removeAttribute('style')
  ensureFont.mockClear()
})
afterEach(() => vi.restoreAllMocks())

describe('appearance page', () => {
  it('starts on Ember, with the matching preset pressed and nothing to reset', async () => {
    await open()
    expect(screen.getByRole('button', { name: 'Ember', pressed: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Graphite', pressed: false })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset to default' })).toBeDisabled()
  })

  it('applies and saves a preset at once', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Graphite' }))
    expect(cssVar('--color-bg')).toBe(findPreset('graphite')!.theme.colors.background)
    expect(root.style.colorScheme).toBe('dark')
    expect(saved()?.name).toBe('Graphite')
    expect(screen.getByRole('button', { name: 'Graphite', pressed: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset to default' })).toBeEnabled()
  })

  it('edits a color by hex, turns the preset into "My theme", and keeps the preset itself untouched', async () => {
    const { user } = await open()
    const field = screen.getByLabelText('Button and active tab')
    await user.clear(field)
    await user.type(field, '#336699')
    expect(cssVar('--color-accent')).toBe('#336699')
    expect(saved()?.colors.accent).toBe('#336699')
    expect(saved()?.name).toBe('My theme')
    // Ember is still available exactly as shipped.
    await user.click(screen.getByRole('button', { name: 'Ember' }))
    expect(cssVar('--color-accent')).toBe(findPreset('ember')!.theme.colors.accent)
  })

  it('treats choosing the current value as no change at all', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Forest' }))
    // Forest already uses Fraunces for headings.
    await user.selectOptions(screen.getByLabelText('Headings'), 'fraunces')
    expect(saved()?.name).toBe('Forest')
    expect(screen.getByRole('button', { name: 'Forest', pressed: true })).toBeInTheDocument()
  })

  it('accepts short and unprefixed hex values', async () => {
    const { user } = await open()
    const field = screen.getByLabelText('Highlight top')
    await user.clear(field)
    await user.type(field, 'f00')
    expect(cssVar('--hero-from')).toBe('#ff0000')
  })

  it('does not change anything for an invalid color, and says so', async () => {
    const { user } = await open()
    const field = screen.getByLabelText('Page background')
    await user.clear(field)
    await user.type(field, 'red')
    expect(cssVar('--color-bg')).toBe(findPreset('ember')!.theme.colors.background)
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getAllByText('Use a color like #1a2b3c').length).toBeGreaterThan(0)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('changes fonts, and loads them', async () => {
    const { user } = await open()
    await user.selectOptions(screen.getByLabelText('Headings'), 'fraunces')
    expect(cssVar('--font-heading')).toMatch(/^'Fraunces Variable', ui-serif/)
    expect(cssVar('--font-body')).toMatch(/^'Inter Variable'/)
    expect(ensureFont).toHaveBeenCalledWith('fraunces')
    expect(saved()?.fonts).toEqual({ heading: 'fraunces', body: 'inter' })
  })

  it('offers system fonts too, which need no download', async () => {
    const { user } = await open()
    await user.selectOptions(screen.getByLabelText('Body text'), 'system-mono')
    expect(cssVar('--font-body')).toMatch(/^ui-monospace/)
  })

  it('changes radius, border width, border style, button shape, shadow and spacing', async () => {
    const { user } = await open()
    fireEvent.change(screen.getByLabelText('Corner radius'), { target: { value: '8' } })
    expect(cssVar('--radius')).toBe('8px')
    fireEvent.change(screen.getByLabelText('Border width'), { target: { value: '3' } })
    expect(cssVar('--border-width')).toBe('3px')

    const choose = (legend: string, label: string) =>
      user.click(within(screen.getByRole('group', { name: legend })).getByLabelText(label))
    await choose('Border style', 'Dashed')
    expect(cssVar('--border-style')).toBe('dashed')
    await choose('Button shape', 'Square')
    expect(cssVar('--radius-button')).toBe('0')
    await choose('Card shadow', 'Strong')
    expect(cssVar('--shadow')).toContain('rgb(')
    await choose('Spacing', 'Compact')
    expect(cssVar('--density')).toBe('0.8')
    await choose('Highlight card style', 'Solid')
    expect(cssVar('--hero-bg')).toBe(findPreset('ember')!.theme.colors.heroVia)
    await choose('Color scheme', 'Dark')
    expect(root.style.colorScheme).toBe('dark')

    expect(saved()?.shape).toMatchObject({
      radius: 8,
      borderWidth: 3,
      borderStyle: 'dashed',
      buttons: 'square',
      shadow: 'strong',
    })
  })

  it('renames the theme but refuses an empty name', async () => {
    const { user } = await open()
    const name = screen.getByLabelText('Theme name')
    await user.clear(name)
    // Nothing is saved while the field is empty, and the name comes back on leaving it.
    expect(saved()).toBeNull()
    await user.type(name, 'Kitchen')
    expect(saved()?.name).toBe('Kitchen')
    await user.clear(name)
    await user.tab()
    expect(name).toHaveValue('Kitchen')
  })

  it('warns when colors become hard to read, and says which', async () => {
    const { user } = await open()
    expect(screen.getByText('Every pair reaches its WCAG contrast target.')).toBeInTheDocument()
    const text = screen.getByLabelText('Text')
    await user.clear(text)
    await user.type(text, '#f4f0ee')
    expect(screen.getByText(/pairs are hard to read/)).toBeInTheDocument()
    const readability = screen.getByRole('region', { name: 'Readability' })
    const row = within(readability).getByText('Text on the page').closest('li')!
    expect(row).toHaveTextContent('1.0:1')
    expect(row).toHaveTextContent('needs 4.5:1')
  })

  it('resets to the default', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Ocean' }))
    await user.click(screen.getByRole('button', { name: 'Reset to default' }))
    expect(cssVar('--color-bg')).toBe(findPreset('ember')!.theme.colors.background)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(screen.getByRole('button', { name: 'Ember', pressed: true })).toBeInTheDocument()
  })

  describe('backup', () => {
    it('downloads the current theme as JSON', async () => {
      const created: Blob[] = []
      // jsdom has no object URLs. They are added for this test and removed again below.
      Object.assign(URL, {
        createObjectURL: (blob: Blob) => (created.push(blob), 'blob:orbit'),
        revokeObjectURL: vi.fn(),
      })
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
      const { user } = await open()
      await user.click(screen.getByRole('button', { name: 'Ocean' }))
      await user.click(screen.getByRole('button', { name: 'Download theme' }))
      expect(click).toHaveBeenCalledTimes(1)
      const text = await created[0]!.text()
      expect(parseTheme(text)?.name).toBe('Ocean')
      Reflect.deleteProperty(URL, 'createObjectURL')
      Reflect.deleteProperty(URL, 'revokeObjectURL')
    })

    it('imports a pasted theme', async () => {
      const { user } = await open()
      const json = JSON.stringify(findPreset('forest')!.theme)
      const box = screen.getByLabelText('Or paste theme JSON')
      expect(screen.getByRole('button', { name: 'Apply pasted theme' })).toBeDisabled()
      fireEvent.change(box, { target: { value: json } })
      await user.click(screen.getByRole('button', { name: 'Apply pasted theme' }))
      expect(cssVar('--color-bg')).toBe(findPreset('forest')!.theme.colors.background)
      expect(box).toHaveValue('')
    })

    it('refuses a theme that is not valid, and keeps the current one', async () => {
      const { user } = await open()
      fireEvent.change(screen.getByLabelText('Or paste theme JSON'), {
        target: { value: '{"name":"x","colors":{"text":"url(https://evil.example)"}}' },
      })
      await user.click(screen.getByRole('button', { name: 'Apply pasted theme' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('not a valid Orbit theme')
      expect(cssVar('--color-bg')).toBe(findPreset('ember')!.theme.colors.background)
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('imports from a file', async () => {
      const { user } = await open()
      const file = new File([JSON.stringify(findPreset('ocean')!.theme)], 'theme.json', {
        type: 'application/json',
      })
      await user.upload(screen.getByLabelText('Theme file'), file)
      await waitFor(() =>
        expect(screen.getByLabelText('Or paste theme JSON')).toHaveValue(
          JSON.stringify(findPreset('ocean')!.theme),
        ),
      )
      await user.click(screen.getByRole('button', { name: 'Apply pasted theme' }))
      expect(cssVar('--color-bg')).toBe(findPreset('ocean')!.theme.colors.background)
    })
  })
})
