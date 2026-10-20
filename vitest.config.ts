import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 15_000,
    // Vitest turns CSS imports into empty strings. The token drift test needs the real text of one file.
    css: { include: [/tokens\.css\?raw$/] },
    include: ['packages/**/*.test.{ts,tsx}', 'apps/**/*.test.{ts,tsx}'],
    // node:sqlite prints an ExperimentalWarning per worker. ADR 0009 explains the choice.
    execArgv: ['--disable-warning=ExperimentalWarning'],
  },
})
