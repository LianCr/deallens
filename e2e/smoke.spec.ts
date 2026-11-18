import { test, expect } from "@playwright/test";

test("home page renders the product headline", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: /deallens/i }),
  ).toBeVisible();
});

test("core content is server-rendered @no-js", async ({ page }) => {
  await page.goto("/");
  // With JavaScript disabled, the headline must still be visible —
  // this is the isomorphic-rendering guarantee, enforced from milestone 0.
  await expect(
    page.getByRole("heading", { level: 1, name: /deallens/i }),
  ).toBeVisible();
});

test("health endpoint reports the CI wiring (mocks on, no secrets)", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ok");
  // playwright.config.ts webServer runs every paid integration in mock mode.
  expect(body.integrations).toMatchObject({
    anthropic: "mock",
    listingSearch: "mock",
    openaiVoice: { transcribe: "mock", speak: "mock" },
  });
});
