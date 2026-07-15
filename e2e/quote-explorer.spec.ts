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

test("the Aggressive chip jumps to a guaranteed Great deal, shareably", async ({
  page,
}) => {
  await page.goto(DEAL_URL);
  const chip = page.getByTestId("chip-aggressive");
  await expect(chip).toContainText("1 in 4 comparable listings closed below this");

  // The chip's href carries its price — read it before clicking so the
  // assertions below track whatever the seeded market produced.
  const href = (await chip.getAttribute("href"))!;
  const chipQuote = new URL(href, page.url()).searchParams.get("quote")!;

  await chip.click();
  const hero = page.getByTestId("verdict-hero");
  await expect(hero.getByRole("heading", { level: 2 })).toHaveText("Great deal");
  await expect(page).toHaveURL(new RegExp(`quote=${chipQuote}`));

  // Reloading the updated URL re-derives the same verdict on the server:
  // chips and slider run the server's own math, so a reload agrees.
  await page.reload();
  await expect(
    page.getByTestId("verdict-hero").getByRole("heading", { level: 2 }),
  ).toHaveText("Great deal");
});

test("without JavaScript a chip is a real link the server answers @no-js", async ({
  page,
}) => {
  await page.goto(DEAL_URL);
  await page.getByTestId("chip-aggressive").click();

  // Full navigation, server-recomputed verdict — progressive enhancement
  // with zero extra code: the chip is just an anchor.
  await expect(page).toHaveURL(/quote=\d+/);
  await expect(
    page.getByTestId("verdict-hero").getByRole("heading", { level: 2 }),
  ).toHaveText("Great deal");
});

test("the explored target flows into the AI brief request and its output", async ({
  page,
}) => {
  await page.goto(DEAL_URL);
  const chip = page.getByTestId("chip-balanced");
  const href = (await chip.getAttribute("href"))!;
  const target = Number(new URL(href, page.url()).searchParams.get("quote"));
  await chip.click();

  // The debounced store publish lands within ~250ms; the button copy
  // flipping is the observable signal that the target is live.
  const formattedTarget = `$${target.toLocaleString("en-US")}`;
  const briefButton = page.getByRole("button", {
    name: `Draft a brief to negotiate toward ${formattedTarget}`,
  });
  await expect(briefButton).toBeVisible();

  const requestPromise = page.waitForRequest("**/api/deal-brief");
  await briefButton.click();
  const request = await requestPromise;
  expect(request.postDataJSON()).toMatchObject({ quote: 24500, target });

  // MOCK_AI echoes the target, so the shopper-visible brief names it.
  await expect(page.getByTestId("deal-brief-output")).toContainText(
    `negotiating to ${formattedTarget}`,
  );
});
