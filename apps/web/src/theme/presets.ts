import type { Theme } from './schema.ts'

export interface Preset {
  readonly id: string
  readonly theme: Theme
}

/** The look of the design the app was built from: warm paper, black pills, ember gradient cards. */
const ember: Theme = {
  name: 'Ember',
  scheme: 'light',
  colors: {
    background: '#f4f0ee',
    surface: '#fafafa',
    surfaceRaised: '#ffffff',
    text: '#0e0e0e',
    textMuted: '#625d59',
    border: '#e4ddd9',
    accent: '#0e0e0e',
    accentText: '#ffffff',
    heroFrom: '#5a0600',
    heroVia: '#c2410c',
    heroTo: '#e0662b',
    heroText: '#ffffff',
    danger: '#c8200e',
    success: '#0b7632',
    warning: '#a84300',
  },
  fonts: { heading: 'inter', body: 'inter' },
  shape: { radius: 28, borderWidth: 0, borderStyle: 'solid', buttons: 'pill', shadow: 'none' },
  density: 'comfortable',
  heroStyle: 'gradient',
}

const emberDark: Theme = {
  ...ember,
  name: 'Ember dark',
  scheme: 'dark',
  colors: {
    background: '#130e0c',
    surface: '#1c1512',
    surfaceRaised: '#281f1b',
    text: '#f6efec',
    textMuted: '#b9aca6',
    border: '#3b2f2a',
    accent: '#f6efec',
    accentText: '#130e0c',
    heroFrom: '#4a0500',
    heroVia: '#b23a09',
    heroTo: '#cf5a1c',
    heroText: '#ffffff',
    danger: '#ff8f80',
    success: '#62d58c',
    warning: '#f4a259',
  },
}

const graphite: Theme = {
  name: 'Graphite',
  scheme: 'dark',
  colors: {
    background: '#0b0b0c',
    surface: '#151517',
    surfaceRaised: '#1f1f23',
    text: '#f2f2f3',
    textMuted: '#a6a6ae',
    border: '#2d2d33',
    accent: '#ffffff',
    accentText: '#0b0b0c',
    heroFrom: '#09090b',
    heroVia: '#27272a',
    heroTo: '#52525b',
    heroText: '#ffffff',
    danger: '#ff8f80',
    success: '#62d58c',
    warning: '#f4a259',
  },
  fonts: { heading: 'space-grotesk', body: 'inter' },
  shape: { radius: 16, borderWidth: 1, borderStyle: 'solid', buttons: 'rounded', shadow: 'none' },
  density: 'comfortable',
  heroStyle: 'gradient',
}

const ocean: Theme = {
  name: 'Ocean',
  scheme: 'light',
  colors: {
    background: '#eaf1f7',
    surface: '#f6f9fc',
    surfaceRaised: '#ffffff',
    text: '#0b1b2b',
    textMuted: '#4d6074',
    border: '#d3e0ec',
    accent: '#0b3a6e',
    accentText: '#ffffff',
    heroFrom: '#04223f',
    heroVia: '#0a5a9c',
    heroTo: '#1478bd',
    heroText: '#ffffff',
    danger: '#b3261e',
    success: '#0b7632',
    warning: '#9a4b00',
  },
  fonts: { heading: 'plus-jakarta-sans', body: 'plus-jakarta-sans' },
  shape: { radius: 20, borderWidth: 0, borderStyle: 'solid', buttons: 'rounded', shadow: 'soft' },
  density: 'comfortable',
  heroStyle: 'gradient',
}

const forest: Theme = {
  name: 'Forest',
  scheme: 'light',
  colors: {
    background: '#eef3ec',
    surface: '#f7faf6',
    surfaceRaised: '#ffffff',
    text: '#12201a',
    textMuted: '#51604f',
    border: '#d8e3d5',
    accent: '#14532d',
    accentText: '#ffffff',
    heroFrom: '#052e16',
    heroVia: '#166534',
    heroTo: '#237a45',
    heroText: '#ffffff',
    danger: '#b3261e',
    success: '#0b7632',
    warning: '#8f4a00',
  },
  fonts: { heading: 'fraunces', body: 'nunito' },
  shape: { radius: 24, borderWidth: 0, borderStyle: 'solid', buttons: 'pill', shadow: 'soft' },
  density: 'spacious',
  heroStyle: 'gradient',
}

/** The plain look the app had before the redesign. */
const classic: Theme = {
  name: 'Classic',
  scheme: 'light',
  colors: {
    background: '#f6f7fb',
    surface: '#ffffff',
    surfaceRaised: '#f6f7fb',
    text: '#1a1d29',
    textMuted: '#565c70',
    border: '#d5d9e5',
    accent: '#3a55e0',
    accentText: '#ffffff',
    heroFrom: '#243a9e',
    heroVia: '#3a55e0',
    heroTo: '#3a55e0',
    heroText: '#ffffff',
    danger: '#b3261e',
    success: '#0b7632',
    warning: '#8f4a00',
  },
  fonts: { heading: 'system-sans', body: 'system-sans' },
  shape: { radius: 8, borderWidth: 1, borderStyle: 'solid', buttons: 'rounded', shadow: 'soft' },
  density: 'comfortable',
  heroStyle: 'solid',
}

export const PRESETS: readonly Preset[] = [
  { id: 'ember', theme: ember },
  { id: 'ember-dark', theme: emberDark },
  { id: 'graphite', theme: graphite },
  { id: 'ocean', theme: ocean },
  { id: 'forest', theme: forest },
  { id: 'classic', theme: classic },
]

export const DEFAULT_PRESET = 'ember'
export const DEFAULT_DARK_PRESET = 'ember-dark'

export const findPreset = (id: string): Preset | undefined => PRESETS.find((p) => p.id === id)

/** What a visitor who never opened the editor sees: Ember, in the scheme their device prefers. */
export function systemTheme(prefersDark: boolean): Theme {
  return findPreset(prefersDark ? DEFAULT_DARK_PRESET : DEFAULT_PRESET)!.theme
}

export function sameTheme(a: Theme, b: Theme): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
