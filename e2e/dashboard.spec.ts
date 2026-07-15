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

test("the fuel bar names its price assumption and recomputes for your mileage", async ({
  page,
}) => {
  await page.goto(DEAL_URL);
  const fuel = page.getByTestId("fuel-cost");
  await fuel.scrollIntoViewIfNeeded();
  await expect(fuel).toBeVisible();

  // Either this week's real national average (attributed) or — when the
  // live fuelprices call can't be made from CI — the honest, explicit
  // $3.60 fallback. Both are legitimate; silence about the price is not.
  await expect(fuel).toHaveText(
    /this week's national average \w+ price, \$\d+\.\d{2}\/gallon \(fueleconomy\.gov\)|and \$3\.60\/gallon/,
  );

  // Editing the mileage assumption recomputes the figure live — the
  // same pure function the server ran, whichever price applied.
  const figure = page.getByTestId("fuel-annual-cost");
  const before = (await figure.textContent())!;
  expect(before).toMatch(/^\$[\d,]+$/);
  await page.getByTestId("fuel-miles-input").fill("24000");
  await expect(figure).not.toHaveText(before);
  await expect(figure).toHaveText(/^\$[\d,]+$/);
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
