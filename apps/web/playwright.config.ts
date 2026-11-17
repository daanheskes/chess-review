import { defineConfig, devices } from '@playwright/test'

// Runs against the production build served with the real _headers (see scripts/serve-dist.mjs).
// Build first: `pnpm build`.
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 90_000 },
  fullyParallel: false, // one analysis at a time keeps timings honest on small CI machines
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    trace: 'retain-on-failure',
    // Keep requests on the network path instead of using an installed service worker.
    serviceWorkers: 'block',
    // Some sandboxes route localhost through a system proxy, which stalls the first request.
    launchOptions: { args: ['--no-proxy-server'] },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4173' },
    },
  ],
  webServer: {
    command: 'node ../../scripts/serve-dist.mjs',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
})
