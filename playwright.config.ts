import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests. Playwright builds the site and serves it with `vite preview`
 * (fixed port), then drives a real Chromium against it. Run with `npm run test:e2e`.
 *
 * Not the dev server: on a cold cache it discovers auto-imported Vuetify
 * components mid-run and reloads the page, which drops clicks in flight.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5199',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run preview -- --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
