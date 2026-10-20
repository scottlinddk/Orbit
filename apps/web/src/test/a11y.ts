import axe from 'axe-core'
import { expect } from 'vitest'

/**
 * Runs axe on the current document and fails with a readable list of violations.
 * jsdom has no layout, so color contrast is not checked here. The tokens are chosen for it
 * and a browser check covers it.
 */
// axe probes canvas support for contrast checks, which jsdom cannot do. Answer "unsupported" quietly.
HTMLCanvasElement.prototype.getContext = () => null

export async function expectNoA11yViolations(root: Element = document.body) {
  const results = await axe.run(root, { rules: { 'color-contrast': { enabled: false } } })
  const summary = results.violations.map(
    (v) => `${v.id}: ${v.help}\n${v.nodes.map((n) => `  ${n.html}`).join('\n')}`,
  )
  expect(summary, 'accessibility violations').toEqual([])
}
