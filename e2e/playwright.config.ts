import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from '@playwright/test'

/**
 * Set ORBIT_E2E_URL to test an Orbit that is already running (for example the Docker image).
 * It must be a fresh instance: the suite creates the first account.
 * Without it, this starts the API from source on port 3100 with a throwaway database and the
 * built web app, so run `pnpm build` first.
 */
const external = process.env.ORBIT_E2E_URL
const port = 3100
const baseURL = external ?? `http://127.0.0.1:${port}`
const chromium = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    // A pre-installed Chromium (as in some sandboxes) instead of the one Playwright downloads.
    ...(chromium ? { launchOptions: { executablePath: chromium, args: ['--no-sandbox'] } } : {}),
  },
  ...(external
    ? {}
    : {
        webServer: {
          command: 'node ../apps/api/src/main.ts',
          url: `${baseURL}/api/v1/health`,
          reuseExistingServer: false,
          timeout: 30_000,
          env: {
            ORBIT_PORT: String(port),
            ORBIT_HOST: '127.0.0.1',
            ORBIT_PUBLIC_URL: baseURL,
            ORBIT_DATABASE_PATH: join(mkdtempSync(join(tmpdir(), 'orbit-e2e-')), 'orbit.sqlite'),
            ORBIT_WEB_DIR: join(import.meta.dirname, '..', 'apps', 'web', 'dist'),
            ORBIT_LOG_LEVEL: 'warn',
            NODE_OPTIONS: '--disable-warning=ExperimentalWarning',
          },
        },
      }),
})
