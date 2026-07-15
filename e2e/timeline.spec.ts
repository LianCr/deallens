import { test, expect, type Page } from "@playwright/test";

const DEAL_URL = "/deal/honda/2022/civic?quote=24500";

/**
 * Scroll the page (not the locator): the SSR skeleton is replaced
 * in-place by the interactive timeline when it enters the viewport, so
 * anchoring a scroll to the skeleton node races its own replacement.
 */
async function scrollToTimeline(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
}

test("timeline renders and the sweep cursor drives the header readout", async ({
  page,
}) => {
  await page.goto(DEAL_URL);
  const timeline = page.getByTestId("price-history-timeline");
  await scrollToTimeline(page);
  await expect(timeline).toBeVisible();

  // Hydration upgrade: the range switch buttons only exist in the
  // interactive version.
  const rangeButton = timeline.getByRole("button", { name: "6M" });
  await expect(rangeButton).toBeVisible({ timeout: 10_000 });

  const svg = timeline.locator("svg");
  // Sections below the timeline (e.g. the AI deal brief) mean "scroll to
  // page bottom" can leave the chart above the viewport, so its box would
  // be off-screen and the hover would miss. Pull the SVG back into view.
  await svg.scrollIntoViewIfNeeded();
  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2);
  // The header now names the month under the cursor.
  await expect(timeline.getByText(/median asking price, \w{3} \d{2}/)).toBeVisible();
});

test("sweeping near an event dot shows it; clicking pins it", async ({ page }) => {
  await page.goto(DEAL_URL);
  const timeline = page.getByTestId("price-history-timeline");
  await scrollToTimeline(page);
  await expect(timeline.getByRole("button", { name: "24M" })).toBeVisible({
    timeout: 10_000,
  });

  const readout = page.getByTestId("timeline-readout");
  await expect(readout).toContainText(/sweep the chart/i);

  // Sweep to a known event dot (every dataset has September model-year
  // events) by walking the pointer across the chart until the readout
  // activates.
  const svg = timeline.locator("svg");
  await svg.scrollIntoViewIfNeeded();
  const box = (await svg.boundingBox())!;
  let activated = false;
  for (let f = 0.05; f <= 0.95; f += 0.05) {
    await page.mouse.move(box.x + box.width * f, box.y + box.height / 2);
    if (!(await readout.getByText(/sweep the chart/i).isVisible().catch(() => false))) {
      activated = true;
      break;
    }
  }
  expect(activated).toBe(true);
  await expect(readout).toContainText(/not causal/i);

  // Click pins: the story survives the pointer leaving the chart.
  await page.mouse.down();
  await page.mouse.up();
  await page.mouse.move(box.x + box.width / 2, box.y - 50);
  await expect(readout.getByText("📌")).toBeVisible();
});

test("range switch narrows the window", async ({ page }) => {
  await page.goto(DEAL_URL);
  const timeline = page.getByTestId("price-history-timeline");
  await scrollToTimeline(page);
  const sixMonths = timeline.getByRole("button", { name: "6M" });
  // The interactive version arrives via lazy in-place upgrade.
  await expect(sixMonths).toBeVisible({ timeout: 10_000 });
  await sixMonths.click();
  await expect(sixMonths).toHaveAttribute("aria-pressed", "true");
});

test("the SSR skeleton shows the full chart with JavaScript disabled @no-js", async ({
  page,
}) => {
  await page.goto(DEAL_URL);
  const timeline = page.getByTestId("price-history-timeline");
  await expect(timeline).toBeVisible();
  await expect(timeline.locator("svg")).toBeVisible();
  await expect(timeline.getByText(/market-event markers/i)).toBeVisible();
});
