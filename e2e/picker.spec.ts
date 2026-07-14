import { test, expect } from "@playwright/test";

/**
 * The picker flow talks to the real NHTSA vPIC API (free, no key) —
 * the same thing a fresh `git clone && npm run dev` exercises.
 */

test("cascade: make + year loads real models, model choice reaches the deal page", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Make").selectOption("Honda");
  await page.getByLabel("Year").selectOption("2022");
  // Client enhancement re-renders via the server; models arrive from vPIC.
  const model = page.getByLabel("Model");
  await expect(model).toBeEnabled({ timeout: 20_000 });
  await model.selectOption("Civic");
  await page.getByLabel(/dealer quote/i).fill("24500");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/deal\/honda\/2022\/civic\?quote=24500/);
  await expect(page.getByRole("heading", { name: /2022 Honda Civic/ })).toBeVisible();
});

test("the same cascade works without JavaScript @no-js", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Make").selectOption("Honda");
  await page.getByLabel("Year").selectOption("2022");
  await page.getByRole("button", { name: "Continue" }).click();

  const model = page.getByLabel("Model");
  await expect(model).toBeEnabled({ timeout: 20_000 });
  await model.selectOption("Civic");
  await page.getByLabel(/dealer quote/i).fill("24500");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/deal\/honda\/2022\/civic\?quote=24500/);
  await expect(page.getByRole("heading", { name: /2022 Honda Civic/ })).toBeVisible();
});
