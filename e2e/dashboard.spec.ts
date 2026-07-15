import { test, expect } from "@playwright/test";

const DEAL_URL = "/deal/honda/2022/civic?quote=24500";

test("a shared deal link renders the verdict, chart, and honesty badges", async ({
  page,
}) => {
  await page.goto(DEAL_URL);
  await expect(page.getByRole("heading", { name: /2022 Honda Civic/ })).toBeVisible();

  const hero = page.getByTestId("verdict-hero");
  await expect(hero).toBeVisible();
  await expect(hero.getByRole("heading", { level: 2 })).toHaveText(
    /Great deal|Fair price|Above market|Not enough data/,
  );

  // Data honesty is on the page, always — one DEMO chip per synthetic
  // section (distribution + history).
  await expect(page.getByText("Vehicle data: NHTSA (real)", { exact: false })).toBeVisible();
  const demoBadges = page.getByText("Demo pricing data");
  await expect(demoBadges).toHaveCount(2);
  await expect(demoBadges.first()).toBeVisible();

  // The distribution chart is server-rendered SVG.
  await expect(page.getByRole("img", { name: /market price distribution/i })).toBeVisible();
});

test("the verdict is server-rendered: readable with JavaScript disabled @no-js", async ({
  page,
}) => {
  await page.goto(DEAL_URL);
  const hero = page.getByTestId("verdict-hero");
  await expect(hero).toBeVisible();
  await expect(hero.getByRole("heading", { level: 2 })).toHaveText(
    /Great deal|Fair price|Above market|Not enough data/,
  );
  await expect(page.getByRole("img", { name: /market price distribution/i })).toBeVisible();
});

test("sweeping the distribution shows a live percentile readout", async ({ page }) => {
  await page.goto(DEAL_URL);
  const overlay = page.getByTestId("chart-overlay");
  await expect(overlay).toBeVisible();
  // The quote-explorer slider made the hero taller, which can leave the
  // chart below the fold — pull it into view so the hover connects.
  await overlay.scrollIntoViewIfNeeded();
  const box = (await overlay.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(overlay.locator("div").last()).toHaveText(/\$\d[\d,]* · cheaper than \d+% of listings/);
});

test("fuzzed share links degrade honestly, never to a 500", async ({ page }) => {
  // Out-of-range year → 404, not an unhandled GraphQL error.
  const badYear = await page.goto("/deal/honda/1900/civic?quote=20000");
  expect(badYear!.status()).toBe(404);

  // Absurd quote (overflows GraphQL Int) → falls back to the quote prompt.
  const badQuote = await page.goto("/deal/honda/2022/civic?quote=99999999999");
  expect(badQuote!.status()).toBe(200);
  await expect(page.getByLabel(/dealer quote/i)).toBeVisible();
});

test("missing quote prompts for one without losing the vehicle", async ({ page }) => {
  await page.goto("/deal/honda/2022/civic");
  await expect(page.getByRole("heading", { name: /2022 Honda Civic/ })).toBeVisible();
  await page.getByLabel(/dealer quote/i).fill("24500");
  await page.getByRole("button", { name: /see where it lands/i }).click();
  await expect(page).toHaveURL(/quote=24500/);
  await expect(page.getByTestId("verdict-hero")).toBeVisible();
});
