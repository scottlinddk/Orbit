import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    // node:sqlite prints an ExperimentalWarning per worker. ADR 0009 explains the choice.
    execArgv: ['--disable-warning=ExperimentalWarning'],
  },
})
