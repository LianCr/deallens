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
