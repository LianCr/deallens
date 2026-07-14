import { test, expect } from "@playwright/test";

/**
 * AI features under MOCK_AI=1 (see playwright.config.ts): the routes
 * return deterministic canned output, so these tests cost nothing and
 * never flake on a live model. The honesty contract (badges, grounding
 * line, rate-limit copy) is asserted exactly as production renders it.
 */

const DEAL_URL = "/deal/honda/2022/civic?quote=24500";

test("the deal brief streams in, permanently labeled as grounded AI", async ({ page }) => {
  await page.goto(DEAL_URL);

  const section = page.getByTestId("deal-brief");
  // Honesty labels are visible before any AI output exists.
  await expect(page.getByText("AI-generated · grounded in the numbers above")).toBeVisible();
  await expect(section.getByText(/AI narrates, math decides/)).toBeVisible();

  const responsePromise = page.waitForResponse("**/api/deal-brief");
  await section.getByRole("button", { name: "Draft my negotiation brief" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  expect(response.headers()["x-deallens-ai"]).toBe("mock");

  const output = page.getByTestId("deal-brief-output");
  await expect(output.getByText("What the numbers say")).toBeVisible();
  await expect(output.getByText("How to negotiate")).toBeVisible();
  await expect(output.getByText(/treat the shape of the argument/)).toBeVisible();
});

test("the NL finder returns catalog-verified candidate cards", async ({ page }) => {
  await page.goto("/");

  const finder = page.getByTestId("nl-finder");
  await finder.getByTestId("nl-finder-input").fill("reliable family SUV under $30k");
  await finder.getByRole("button", { name: "Find candidates" }).click();

  const cards = page.getByTestId("nl-finder-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toHaveAttribute("href", "/deal/honda/2022/cr-v");
  await expect(cards.first()).toContainText("2022 Honda CR-V");
  await expect(page.getByText(/verified against the NHTSA catalog/)).toBeVisible();

  // The cards are real deep links into the deal flow.
  await cards.first().click();
  await expect(page).toHaveURL(/\/deal\/honda\/2022\/cr-v/);
});

test("AI endpoints rate-limit with honest copy, per IP", async ({ request }, testInfo) => {
  // A spoofed per-project client IP keeps this probe isolated from the
  // browser tests (and from the other browser projects' probes).
  const headers = {
    "content-type": "application/json",
    "x-forwarded-for": `429-probe-${testInfo.project.name}`,
  };
  const post = () =>
    request.post("/api/find", { headers, data: { query: "family SUV probe" } });

  const first = await post();
  expect(first.status()).toBe(200);

  let limited = null;
  for (let i = 0; i < 31; i++) {
    const response = await post();
    if (response.status() === 429) {
      limited = response;
      break;
    }
  }
  expect(limited, "expected the per-minute limit to trip").not.toBeNull();
  const body = (await limited!.json()) as { reason: string; message: string };
  expect(body.reason).toBe("ip-minute");
  expect(body.message).toContain("Try again shortly");
});

test("without JavaScript the verdict stands and the AI note is honest @no-js", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.use.javaScriptEnabled !== false,
    "noscript content only renders in the no-JS project",
  );
  await page.goto(DEAL_URL);

  // Core conclusion: untouched by the AI layer.
  await expect(page.getByTestId("verdict-hero")).toBeVisible();
  // The grounding disclaimer is server-rendered, not hydration-dependent.
  await expect(page.getByText(/AI narrates, math decides/)).toBeVisible();
  // The <noscript> fallback ships in the SSR HTML. (Asserted on the
  // markup: Chromium's JS-disabled emulation stops script execution but
  // the parser still treats scripting as on, so <noscript> never paints.)
  expect(await page.content()).toContain(
    "The AI brief needs JavaScript — the verdict above doesn",
  );
});
