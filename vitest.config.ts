import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 15_000,
    include: ['packages/**/*.test.{ts,tsx}', 'apps/**/*.test.{ts,tsx}'],
    // node:sqlite prints an ExperimentalWarning per worker. ADR 0009 explains the choice.
    execArgv: ['--disable-warning=ExperimentalWarning'],
  },
})
