import { test, expect } from "@playwright/test";

/**
 * Vehicle Listing Analyzer — primary research path.
 * Playwright webServer sets MOCK_LISTING_SEARCH=1 for fixture-shaped
 * citable results without a live SerpAPI key.
 */

test("listing analyzer produces comparables, verdict, and trust trace", async ({ page }) => {
  await page.goto("/research");
  await expect(page.getByRole("heading", { name: /Is this listing a good deal/i })).toBeVisible();

  await page.getByLabel("Make").fill("Honda");
  await page.getByLabel("Model").fill("Civic");
  await page.getByLabel("Year").fill("2022");
  await page.getByLabel("Asking price ($)").fill("24500");
  await page.getByLabel("Mileage").fill("42000");

  const responsePromise = page.waitForResponse("**/api/research");
  await page.getByRole("button", { name: "Analyze this listing" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);

  const report = page.getByRole("article", { name: "Research report" });
  await expect(report).toBeVisible();
  await expect(report.getByText(/comparable listings/i).first()).toBeVisible();
  await expect(report.getByRole("heading", { name: "Trust Trace" })).toBeVisible();
  await expect(report.getByRole("heading", { name: "Comparable listings" })).toBeVisible();
  await expect(report.locator("table a").first()).toHaveAttribute("href", /^https?:\/\//);
});

test("home promotes the listing analyzer @no-js", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Open listing analyzer/i })).toBeVisible();
});
