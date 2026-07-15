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
    // Each project spoofs its own client IP so the per-IP AI rate
    // buckets never couple parallel browser projects to each other.
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...chromiumLaunch,
        extraHTTPHeaders: { "x-forwarded-for": "e2e-chromium" },
      },
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        extraHTTPHeaders: { "x-forwarded-for": "e2e-firefox" },
      },
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        extraHTTPHeaders: { "x-forwarded-for": "e2e-webkit" },
      },
    },
    {
      name: "chromium-no-js",
      grep: /@no-js/,
      use: {
        ...devices["Desktop Chrome"],
        javaScriptEnabled: false,
        ...chromiumLaunch,
        extraHTTPHeaders: { "x-forwarded-for": "e2e-chromium-no-js" },
      },
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
      MOCK_TTS: "1",
      // Roomy for one project's traffic (each project has its own IP
      // bucket via extraHTTPHeaders above); the rate-limit spec trips
      // this exact number with its own spoofed probe IP.
      AI_LIMIT_IP_PER_MINUTE: "60",
      AI_LIMIT_IP_PER_DAY: "1000",
      AI_LIMIT_GLOBAL_PER_DAY: "100000",
    },
  },
});
