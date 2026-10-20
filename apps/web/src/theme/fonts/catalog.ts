// Generated from the installed @fontsource-variable packages. Edit by regenerating, not by hand.
// Only the latin and latin-ext files of each font are bundled (Danish and most European text).
// Every file is self-hosted: the CSP allows fonts from this origin only, and nothing is
// requested from a third party.
import type { FontEntry } from './types.ts'

// Unicode ranges as published by Google Fonts. A few fonts differ slightly, so they are kept as is.
const R0 =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
const R1 =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'
const R2 =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF'

export const FONT_CATALOG: readonly FontEntry[] = [
  {
    id: 'bricolage-grotesque',
    label: 'Bricolage Grotesque',
    category: 'sans',
    family: 'Bricolage Grotesque Variable',
    weight: '200 800',
    ranges: { latin: R0, latinExt: R1 },
    files: () =>
      Promise.all([
        import('@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2?url'),
        import('@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-ext-wght-normal.woff2?url'),
      ]).then(([latin, latinExt]) => ({ latin: latin.default, latinExt: latinExt.default })),
  },
  {
    id: 'dm-sans',
    label: 'DM Sans',
    category: 'sans',
    family: 'DM Sans Variable',
    weight: '100 1000',
    ranges: { latin: R0, latinExt: R1 },
    files: () =>
      Promise.all([
        import('@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2?url'),
        import('@fontsource-variable/dm-sans/files/dm-sans-latin-ext-wght-normal.woff2?url'),
      ]).then(([latin, latinExt]) => ({ latin: latin.default, latinExt: latinExt.default })),
  },
  {
    id: 'figtree',
    label: 'Figtree',
    category: 'sans',
    family: 'Figtree Variable',
    weight: '300 900',
    ranges: { latin: R0, latinExt: R1 },
    files: () =>
      Promise.all([
        import('@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2?url'),
        import('@fontsource-variable/figtree/files/figtree-latin-ext-wght-normal.woff2?url'),
      ]).then(([latin, latinExt]) => ({ latin: latin.default, latinExt: latinExt.default })),
  },
  {
    id: 'fira-code',
    label: 'Fira Code',
    category: 'mono',
    family: 'Fira Code Variable',
    weight: '300 700',
    ranges: { latin: R0, latinExt: R1 },
    files: () =>
      Promise.all([
        import('@fontsource-variable/fira-code/files/fira-code-latin-wght-normal.woff2?url'),
        import('@fontsource-variable/fira-code/files/fira-code-latin-ext-wght-normal.woff2?url'),
      ]).then(([latin, latinExt]) => ({ latin: latin.default, latinExt: latinExt.default })),
  },
  {
    id: 'fraunces',
    label: 'Fraunces',
    category: 'serif',
    family: 'Fraunces Variable',
    weight: '100 900',
    ranges: { latin: R0, latinExt: R1 },
    files: () =>
      Promise.all([
        import('@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2?url'),
        import('@fontsource-variable/fraunces/files/fraunces-latin-ext-wght-normal.woff2?url'),
      ]).then(([latin, latinExt]) => ({ latin: latin.default, latinExt: latinExt.default })),
  },
  {
    id: 'geist',
    label: 'Geist',
    category: 'sans',
    family: 'Geist Variable',
    weight: '100 900',
    ranges: { latin: R0, latinExt: R1 },
    files: () =>
      Promise.all([
        import('@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url'),
        import('@fontsource-variable/geist/files/geist-latin-ext-wght-normal.woff2?url'),
      ]).then(([latin, latinExt]) => ({ latin: latin.default, latinExt: latinExt.default })),
  },
  {
    id: 'instrument-sans',
    label: 'Instrument Sans',
    category: 'sans',
    family: 'Instrument Sans Variable',
    weight: '400 700',
    ranges: { latin: R0, latinExt: R1 },
    files: () =>
      Promise.all([
        import('@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2?url'),
        import('@fontsource-variable/instrument-sans/files/instrument-sans-latin-ext-wght-normal.woff2?url'),
      ]).then(([latin, latinExt]) => ({ latin: latin.default, latinExt: latinExt.default })),
  },
  {
    id: 'inter',
    label: 'Inter',
    category: 'sans',
    family: 'Inter Variable',
    weight: '100 900',
    ranges: { latin: R0, latinExt: R1 },
    files: () =>
      Promise.all([
        import('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url'),
        import('@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2?url'),
      ]).then(([latin, latinExt]) => ({ latin: latin.default, latinExt: latinExt.default })),
  },
  {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    category: 'mono',
    family: 'JetBrains Mono Variable',
    weight: '100 800',
    ranges: { latin: R0, latinExt: R1 },
    files: () =>
      Promise.all([
        import('@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url'),
        import('@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-ext-wght-normal.woff2?url'),
      ]).then(([latin, latinExt]) => ({ latin: latin.default, latinExt: latinExt.default })),
  },
  {
    id: 'lexend',
    label: 'Lexend',
    category: 'sans',
    family: 'Lexend Variable',
    weight: '100 900',
    ranges: { latin: R0, latinExt: R1 },
    files: () =>
      Promise.all([
        import('@fontsource-variable/lexend/files/lexend-latin-wght-normal.woff2?url'),
        import('@fontsource-variable/lexend/files/lexend-latin-ext-wght-normal.woff2?url'),
      ]).then(([latin, latinExt]) => ({ latin: latin.default, latinExt: latinExt.default })),
  },
  {
    id: 'lora',
    label: 'Lora',
    category: 'serif',
    family: 'Lora Variable',
    weight: '400 700',
    ranges: { latin: R0, latinExt: R1 },
    files: () =>
      Promise.all([
        import('@fontsource-variable/lora/files/lora-latin-wght-normal.woff2?url'),
        import('@fontsource-variable/lora/files/lora-latin-ext-wght-normal.woff2?url'),
      ]).then(([latin, latinExt]) => ({ latin: latin.default, latinExt: latinExt.default })),
  },
  {
    id: 'manrope',
    label: 'Manrope',
    category: 'sans',
    family: 'Manrope Variable',
    weight: '200 800',
    ranges: { latin: R0, latinExt: R1 },
    files: () =>
      Promise.all([
        import('@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2?url'),
        import('@fontsource-variable/manrope/files/manrope-latin-ext-wght-normal.woff2?url'),
      ]).then(([latin, latinExt]) => ({ latin: latin.default, latinExt: latinExt.default })),
  },
  {
    id: 'merriweather',
    label: 'Merriweather',
    category: 'serif',
    family: 'Merriweather Variable',
    weight: '300 900',
    ranges: { latin: R0, latinExt: R1 },
    files: () =>
      Promise.all([
        import('@fontsource-variable/merriweather/files/merriweather-latin-wght-normal.woff2?url'),
        import('@fontsource-variable/merriweather/files/merriweather-latin-ext-wght-normal.woff2?url'),
      ]).then(([latin, latinExt]) => ({ latin: latin.default, latinExt: latinExt.default })),
  },
  {
    id: 'montserrat',
    label: 'Montserrat',
    category: 'sans',
    family: 'Montserrat Variable',
    weight: '100 900',
    ranges: { latin: R0, latinExt: R1 },
    files: () =>
      Promise.all([
        import('@fontsource-variable/montserrat/files/montserrat-latin-wght-normal.woff2?url'),
        import('@fontsource-variable/montserrat/files/montserrat-latin-ext-wght-normal.woff2?url'),
      ]).then(([latin, latinExt]) => ({ latin: latin.default, latinExt: latinExt.default })),
  },
  {
    id: 'nunito',
    label: 'Nunito',
    category: 'sans',
    family: 'Nunito Variable',
    weight: '200 1000',
    ranges: { latin: R0, latinExt: R1 },
    files: () =>
      Promise.all([
        import('@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2?url'),
        import('@fontsource-variable/nunito/files/nunito-latin-ext-wght-normal.woff2?url'),
      ]).then(([latin, latinExt]) => ({ latin: latin.default, latinExt: latinExt.default })),
  },
  {
    id: 'onest',
    label: 'Onest',
    category: 'sans',
    family: 'Onest Variable',
    weight: '100 900',
    ranges: { latin: R0, latinExt: R1 },
    files: () =>
      Promise.all([
        import('@fontsource-variable/onest/files/onest-latin-wght-normal.woff2?url'),
        import('@fontsource-variable/onest/files/onest-latin-ext-wght-normal.woff2?url'),
      ]).then(([latin, latinExt]) => ({ latin: latin.default, latinExt: latinExt.default })),
  },
  {
    id: 'open-sans',
    label: 'Open Sans',
    category: 'sans',
    family: 'Open Sans Variable',
    weight: '300 800',
    ranges: { latin: R0, latinExt: R1 },
    files: () =>
      Promise.all([
        import('@fontsource-variable/open-sans/files/open-sans-latin-wght-normal.woff2?url'),
        import('@fontsource-variable/open-sans/files/open-sans-latin-ext-wght-normal.woff2?url'),
      ]).then(([latin, latinExt]) => ({ latin: latin.default, latinExt: latinExt.default })),
  },
  {
    id: 'outfit',
    label: 'Outfit',
    category: 'sans',
    family: 'Outfit Variable',
    weight: '100 900',
    ranges: { latin: R0, latinExt: R1 },
    files: () =>
      Promise.all([
        import('@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2?url'),
        import('@fontsource-variable/outfit/files/outfit-latin-ext-wght-normal.woff2?url'),
      ]).then(([latin, latinExt]) => ({ latin: latin.default, latinExt: latinExt.default })),
  },
  {
    id: 'playfair-display',
    label: 'Playfair Display',
    category: 'serif',
    family: 'Playfair Display Variable',
    weight: '400 900',
    ranges: { latin: R0, latinExt: R1 },
    files: () =>
      Promise.all([
        import('@fontsource-variable/playfair-display/files/playfair-display-latin-wght-normal.woff2?url'),
        import('@fontsource-variable/playfair-display/files/playfair-display-latin-ext-wght-normal.woff2?url'),
      ]).then(([latin, latinExt]) => ({ latin: latin.default, latinExt: latinExt.default })),
  },
  {
    id: 'plus-jakarta-sans',
    label: 'Plus Jakarta Sans',
    category: 'sans',
    family: 'Plus Jakarta Sans Variable',
    weight: '200 800',
    ranges: { latin: R0, latinExt: R1 },
    files: () =>
      Promise.all([
        import('@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2?url'),
        import('@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-ext-wght-normal.woff2?url'),
      ]).then(([latin, latinExt]) => ({ latin: latin.default, latinExt: latinExt.default })),
  },
  {
    id: 'raleway',
    label: 'Raleway',
    category: 'sans',
    family: 'Raleway Variable',
    weight: '100 900',
    ranges: { latin: R0, latinExt: R1 },
    files: () =>
      Promise.all([
        import('@fontsource-variable/raleway/files/raleway-latin-wght-normal.woff2?url'),
        import('@fontsource-variable/raleway/files/raleway-latin-ext-wght-normal.woff2?url'),
      ]).then(([latin, latinExt]) => ({ latin: latin.default, latinExt: latinExt.default })),
  },
  {
    id: 'rubik',
    label: 'Rubik',
    category: 'sans',
    family: 'Rubik Variable',
    weight: '300 900',
    ranges: { latin: R0, latinExt: R1 },
    files: () =>
      Promise.all([
        import('@fontsource-variable/rubik/files/rubik-latin-wght-normal.woff2?url'),
        import('@fontsource-variable/rubik/files/rubik-latin-ext-wght-normal.woff2?url'),
      ]).then(([latin, latinExt]) => ({ latin: latin.default, latinExt: latinExt.default })),
  },
  {
    id: 'sora',
    label: 'Sora',
    category: 'sans',
    family: 'Sora Variable',
    weight: '100 800',
    ranges: { latin: R0, latinExt: R1 },
    files: () =>
      Promise.all([
        import('@fontsource-variable/sora/files/sora-latin-wght-normal.woff2?url'),
        import('@fontsource-variable/sora/files/sora-latin-ext-wght-normal.woff2?url'),
      ]).then(([latin, latinExt]) => ({ latin: latin.default, latinExt: latinExt.default })),
  },
  {
    id: 'source-serif-4',
    label: 'Source Serif 4',
    category: 'serif',
    family: 'Source Serif 4 Variable',
    weight: '200 900',
    ranges: { latin: R0, latinExt: R2 },
    files: () =>
      Promise.all([
        import('@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2?url'),
        import('@fontsource-variable/source-serif-4/files/source-serif-4-latin-ext-wght-normal.woff2?url'),
      ]).then(([latin, latinExt]) => ({ latin: latin.default, latinExt: latinExt.default })),
  },
  {
    id: 'space-grotesk',
    label: 'Space Grotesk',
    category: 'sans',
    family: 'Space Grotesk Variable',
    weight: '300 700',
    ranges: { latin: R0, latinExt: R1 },
    files: () =>
      Promise.all([
        import('@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2?url'),
        import('@fontsource-variable/space-grotesk/files/space-grotesk-latin-ext-wght-normal.woff2?url'),
      ]).then(([latin, latinExt]) => ({ latin: latin.default, latinExt: latinExt.default })),
  },
  {
    id: 'work-sans',
    label: 'Work Sans',
    category: 'sans',
    family: 'Work Sans Variable',
    weight: '100 900',
    ranges: { latin: R0, latinExt: R1 },
    files: () =>
      Promise.all([
        import('@fontsource-variable/work-sans/files/work-sans-latin-wght-normal.woff2?url'),
        import('@fontsource-variable/work-sans/files/work-sans-latin-ext-wght-normal.woff2?url'),
      ]).then(([latin, latinExt]) => ({ latin: latin.default, latinExt: latinExt.default })),
  },
]
