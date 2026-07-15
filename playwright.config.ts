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
/**
 * Sandboxed/CI-restricted environments can point Chromium at a
 * preinstalled binary instead of downloading one (e.g.
 * PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium). Unset = default.
 */
const chromiumLaunch = process.env.PW_CHROMIUM_EXECUTABLE
  ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_EXECUTABLE } }
  : {};

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
    { name: "chromium", use: { ...devices["Desktop Chrome"], ...chromiumLaunch } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    {
      name: "chromium-no-js",
      grep: /@no-js/,
      use: { ...devices["Desktop Chrome"], javaScriptEnabled: false, ...chromiumLaunch },
    },
  ],
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    // AI routes run in deterministic mock mode: zero API cost, zero flake.
    // Limits are roomy for browser traffic (which all shares one IP) while
    // the rate-limit spec probes with its own spoofed IPs.
    env: {
      MOCK_AI: "1",
      MOCK_STT: "1",
      AI_LIMIT_IP_PER_MINUTE: "30",
      AI_LIMIT_IP_PER_DAY: "1000",
      AI_LIMIT_GLOBAL_PER_DAY: "100000",
    },
  },
});
