import { test, expect } from "@playwright/test";

const DEAL_URL = "/deal/honda/2022/civic?quote=24500";

test("dragging the slider recomputes the verdict live, moves the marker, and keeps the URL shareable", async ({
  page,
}) => {
  await page.goto(DEAL_URL);
  const slider = page.getByLabel(/drag to explore/i);
  await expect(slider).toBeVisible();

  // The range maximum sits above every market sample, so the verdict
  // there is Above market regardless of the seeded distribution — and
  // the chart marker must travel right to the plot's edge. (The minimum
  // wouldn't do: for this seed the dealer quote is already below the
  // whole market, so the marker starts clamped at the left edge and
  // dragging further left honestly moves nothing.)
  const max = (await slider.getAttribute("max"))!;
  await slider.fill(max);

  const hero = page.getByTestId("verdict-hero");
  await expect(hero.getByRole("heading", { level: 2 })).toHaveText("Above market");
  await expect(hero).toContainText("Exploring:");

  // The chart's quote marker slid right — transform only, no redraw.
  await expect(page.locator("[data-quote-marker]")).toHaveAttribute(
    "transform",
    /translate\([1-9]/,
  );

  // The URL tracks the explored quote (debounced replaceState)…
  await expect(page).toHaveURL(new RegExp(`quote=${max}`));

  // …and reloading it gets the same verdict server-rendered: the client
  // ran the same pure functions the server runs.
  await page.reload();
  await expect(
    page.getByTestId("verdict-hero").getByRole("heading", { level: 2 }),
  ).toHaveText("Above market");
});

test("without JavaScript the slider is a GET form the server answers @no-js", async ({
  page,
}) => {
  await page.goto(DEAL_URL);
  const slider = page.getByLabel(/drag to explore/i);
  await expect(slider).toBeVisible();

  // Home is native range-input behavior — no script involved.
  await slider.press("Home");
  await page.getByRole("button", { name: /check this quote/i }).click();

  await expect(page).toHaveURL(/quote=\d+/);
  await expect(
    page.getByTestId("verdict-hero").getByRole("heading", { level: 2 }),
  ).toHaveText("Great deal");
});
