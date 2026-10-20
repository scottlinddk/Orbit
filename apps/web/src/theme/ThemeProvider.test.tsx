// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findPreset } from './presets.ts'
import { STORAGE_KEY, saveTheme, serializeTheme } from './storage.ts'
import { ThemeProvider, bootTheme } from './ThemeProvider.tsx'
import { useTheme } from './ThemeContext.ts'

const ensureFont = vi.fn<(id: string) => Promise<void>>(() => Promise.resolve())
vi.mock('./fonts/loader.ts', () => ({ ensureFont: (id: string) => ensureFont(id) }))

const root = document.documentElement
const ember = findPreset('ember')!.theme
const graphite = findPreset('graphite')!.theme

function Probe() {
  const { theme, customized, setTheme, reset, importTheme } = useTheme()
  return (
    <div>
      <p data-testid="name">{theme.name}</p>
      <p data-testid="customized">{String(customized)}</p>
      <button onClick={() => setTheme(graphite)}>graphite</button>
      <button onClick={reset}>reset</button>
      <button onClick={() => void importTheme(serializeTheme(ember))}>import ok</button>
      <button onClick={() => void importTheme('{"nope":1}')}>import bad</button>
    </div>
  )
}

const mountProbe = () =>
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  )

/** Lets a test choose the device's color scheme and change it later. */
function stubMatchMedia(initiallyDark: boolean) {
  let matches = initiallyDark
  const listeners = new Set<(e: { matches: boolean }) => void>()
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return matches
    },
    addEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.add(l),
    removeEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.delete(l),
  }))
  return (dark: boolean) => {
    matches = dark
    listeners.forEach((l) => l({ matches: dark }))
  }
}

beforeEach(() => {
  localStorage.clear()
  root.removeAttribute('style')
  ensureFont.mockClear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('ThemeProvider', () => {
  it('shows Ember by default and applies it to the page', () => {
    mountProbe()
    expect(screen.getByTestId('name')).toHaveTextContent('Ember')
    expect(screen.getByTestId('customized')).toHaveTextContent('false')
    expect(root.style.getPropertyValue('--color-bg')).toBe(ember.colors.background)
    expect(root.style.colorScheme).toBe('light')
  })

  it('uses the dark variant when the device prefers dark, and follows it while nothing is chosen', () => {
    const setDark = stubMatchMedia(true)
    mountProbe()
    expect(screen.getByTestId('name')).toHaveTextContent('Ember dark')
    act(() => setDark(false))
    expect(screen.getByTestId('name')).toHaveTextContent('Ember')
    expect(root.dataset.scheme).toBe('light')
  })

  it('ignores the device scheme once a theme was chosen', async () => {
    const setDark = stubMatchMedia(false)
    const user = userEvent.setup()
    mountProbe()
    await user.click(screen.getByText('graphite'))
    act(() => setDark(true))
    act(() => setDark(false))
    expect(screen.getByTestId('name')).toHaveTextContent('Graphite')
  })

  it('applies, saves and loads the chosen theme', async () => {
    const user = userEvent.setup()
    const first = mountProbe()
    await user.click(screen.getByText('graphite'))
    expect(screen.getByTestId('customized')).toHaveTextContent('true')
    expect(root.style.getPropertyValue('--color-bg')).toBe(graphite.colors.background)
    expect(localStorage.getItem(STORAGE_KEY)).toContain('Graphite')
    first.unmount()
    mountProbe()
    expect(screen.getByTestId('name')).toHaveTextContent('Graphite')
  })

  it('resets to the default and forgets the saved theme', async () => {
    const user = userEvent.setup()
    mountProbe()
    await user.click(screen.getByText('graphite'))
    await user.click(screen.getByText('reset'))
    expect(screen.getByTestId('name')).toHaveTextContent('Ember')
    expect(screen.getByTestId('customized')).toHaveTextContent('false')
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(root.style.getPropertyValue('--color-bg')).toBe(ember.colors.background)
  })

  it('imports a valid theme and refuses an invalid one without changing anything', async () => {
    const user = userEvent.setup()
    mountProbe()
    await user.click(screen.getByText('graphite'))
    await user.click(screen.getByText('import bad'))
    expect(screen.getByTestId('name')).toHaveTextContent('Graphite')
    await user.click(screen.getByText('import ok'))
    expect(screen.getByTestId('name')).toHaveTextContent('Ember')
  })

  it('starts font loading for the theme’s fonts, and again when they change', async () => {
    const user = userEvent.setup()
    mountProbe()
    expect(ensureFont).toHaveBeenCalledWith('inter')
    await user.click(screen.getByText('graphite'))
    expect(ensureFont).toHaveBeenCalledWith('space-grotesk')
  })

  it('still works when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const user = userEvent.setup()
    mountProbe()
    expect(screen.getByTestId('name')).toHaveTextContent('Ember')
    await user.click(screen.getByText('graphite'))
    // The choice applies for this visit even though it cannot be kept.
    expect(screen.getByTestId('name')).toHaveTextContent('Graphite')
    vi.restoreAllMocks()
  })

  it('refuses to be used outside a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/inside ThemeProvider/)
    spy.mockRestore()
  })
})

describe('bootTheme', () => {
  it('applies the saved theme before anything renders', () => {
    saveTheme(graphite)
    bootTheme()
    expect(root.style.getPropertyValue('--color-bg')).toBe(graphite.colors.background)
    expect(ensureFont).toHaveBeenCalledWith('space-grotesk')
  })

  it('applies the default when nothing is saved', () => {
    bootTheme()
    expect(root.style.getPropertyValue('--color-bg')).toBe(ember.colors.background)
  })

  it('forgets a saved theme when the page is opened with ?reset-theme, and cleans the address', () => {
    saveTheme(graphite)
    window.history.replaceState(null, '', '/d/d1?reset-theme&keep=1')
    bootTheme()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(root.style.getPropertyValue('--color-bg')).toBe(ember.colors.background)
    expect(window.location.search).toBe('?keep=1')
  })

  it('recovers from a corrupt saved theme', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    bootTheme()
    expect(root.style.getPropertyValue('--color-bg')).toBe(ember.colors.background)
  })
})
