import { defineConfig, devices } from '@playwright/test'

const PORT = 4173

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // 'list' for the terminal, 'html' for a browsable record of the run
  // (per-test steps, plus trace/screenshot on failure) in playwright-report/.
  // open: 'never' so a failing run exits instead of blocking on a browser
  // tab — view it on demand with `npm run test:e2e:report`.
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // issue #24: the full suite runs on both desktop and a real mobile device
  // emulation, not just the couple of specs that manually override viewport
  // size — catches device-specific breakage anywhere before Demo Day.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
  ],
  // No GEMINI_API_KEY needed: every spec intercepts /api/generate and
  // /api/revise via page.route() before they leave the browser, so tests
  // never touch the (quota-limited) real Gemini API and stay deterministic.
  webServer: {
    command: `npx vite --host 0.0.0.0 --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
})
