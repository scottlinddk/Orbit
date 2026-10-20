export type FontCategory = 'sans' | 'serif' | 'mono'

export interface FontEntry {
  /** Stored in themes. Same as the Fontsource slug, so never rename it. */
  readonly id: string
  readonly label: string
  readonly category: FontCategory
  /** The CSS family name the font registers under, such as `Inter Variable`. */
  readonly family: string
  /** The weight range of the variable font, such as `100 900`. */
  readonly weight: string
  readonly ranges: { readonly latin: string; readonly latinExt: string }
  /** Fetches the font files. Called only when the font is first used. */
  readonly files: () => Promise<{ latin: string; latinExt: string }>
}
