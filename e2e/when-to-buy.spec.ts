import { test, expect } from "@playwright/test";

const DEAL_URL = "/deal/honda/2022/civic?quote=24500";

/**
 * The when-to-buy hint under the price-history timeline. The demo
 * dataset is deterministic (seeded by make|model|year) and gives this
 * vehicle 24 months of history with seasonality, so the domain
 * function always finds a >1% dip here.
 */
test("the when-to-buy hint names the cheapest month", async ({ page }) => {
  await page.goto(DEAL_URL);
  const hint = page.getByTestId("when-to-buy");
  await expect(hint).toBeVisible();
  await expect(hint).toContainText(/dipped lowest in [A-Z][a-z]+/);
  await expect(hint).toContainText(/% below/);
});

test("the hint is server-rendered: visible with JavaScript disabled @no-js", async ({
  page,
}) => {
  await page.goto(DEAL_URL);
  const hint = page.getByTestId("when-to-buy");
  await expect(hint).toBeVisible();
  await expect(hint).toContainText(/dipped lowest in [A-Z][a-z]+/);
});
