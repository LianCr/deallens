import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against a production build (`next start`), not the dev server,
 * so what we test is what ships. Run `npm run build` before `npm run test:e2e`.
 *
 * Four projects:
 *  - chromium / firefox / webkit: cross-browser coverage
 *  - chromium-no-js: JavaScript disabled — proves the isomorphic claim
 *    (server-rendered core content must be visible without any client JS).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    {
      name: "chromium-no-js",
      grep: /@no-js/,
      use: { ...devices["Desktop Chrome"], javaScriptEnabled: false },
    },
  ],
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
