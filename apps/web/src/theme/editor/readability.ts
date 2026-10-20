import { contrastRatio, grade, type Grade } from '../contrast.ts'
import type { Theme } from '../schema.ts'

export interface Check {
  label: string
  ratio: number
  grade: Grade
  /** The ratio the pair should reach. Body text needs 4.5. Large text and controls need 3. */
  needs: 3 | 4.5
  pass: boolean
}

function check(label: string, a: string, b: string, needs: 3 | 4.5 = 4.5): Check {
  const ratio = contrastRatio(a, b)
  return { label, ratio, grade: grade(ratio), needs, pass: ratio >= needs }
}

/** The color pairs the interface actually draws, so a theme can be judged before it is saved. */
export function readability({ colors, heroStyle }: Theme): Check[] {
  const hero =
    heroStyle === 'gradient'
      ? [
          check('Highlight card text, top', colors.heroText, colors.heroFrom),
          check('Highlight card text, middle', colors.heroText, colors.heroVia),
          check('Highlight card text, bottom', colors.heroText, colors.heroTo, 3),
        ]
      : [check('Highlight card text', colors.heroText, colors.heroVia)]
  return [
    check('Text on the page', colors.text, colors.background),
    check('Text on cards', colors.text, colors.surface),
    check('Secondary text on cards', colors.textMuted, colors.surface),
    check('Button text', colors.accentText, colors.accent),
    ...hero,
    check('Negative amounts', colors.danger, colors.surfaceRaised),
    check('Positive amounts', colors.success, colors.surfaceRaised),
  ]
}
