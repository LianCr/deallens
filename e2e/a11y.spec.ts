import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Automated accessibility gate (axe-core, WCAG 2.0/2.1 A + AA rules).
 *
 * Any violation fails the build — no disabled rules, no excluded nodes.
 * Runs in the `chromium` project only: color-contrast results depend on
 * the engine's font rasterization and color handling, and one stable
 * engine makes a non-flaky gate. (Firefox/WebKit still run every
 * functional spec.)
 *
 * What axe can NOT prove: keyboard flow, focus order, whether alt text
 * or labels are *meaningful*, or that a screen reader announces the D3
 * charts sensibly. Those stay manual checks (docs/RUNBOOK.md).
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const DEAL_URL = "/deal/honda/2022/civic?quote=24500";

test.skip(({ browserName }) => browserName !== "chromium", "axe gate runs on Chromium only");

/** Wait for entrance animations to finish: a mid-fade element has a
 * temporarily lower contrast, which is not what a user reads. */
async function settle(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
  );
}

async function expectNoViolations(page: Page) {
  await settle(page);
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const summary = results.violations.map(
    (v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
  );
  expect(summary, "axe WCAG 2.1 AA violations").toEqual([]);
}

test.describe("accessibility @a11y", () => {
  for (const scheme of ["light", "dark"] as const) {
    test.describe(`${scheme} mode`, () => {
      test.use({ colorScheme: scheme });

      test("home + picker cascade", async ({ page }) => {
        await page.goto("/?make=Honda&year=2022");
        await expectNoViolations(page);
      });

      test("listing analyzer, before and after a result", async ({ page }) => {
        await page.goto("/research");
        await expectNoViolations(page);

        await page.getByLabel("Make").fill("Honda");
        await page.getByLabel("Model").fill("Civic");
        await page.getByLabel("Year").fill("2022");
        await page.getByLabel("Asking price ($)").fill("24500");
        await page.getByLabel("Mileage").fill("42000");
        await page.getByRole("button", { name: "Analyze this listing" }).click();
        await expect(page.getByRole("article", { name: "Research report" })).toBeVisible();
        await expectNoViolations(page);
      });

      test("deal dashboard, including the AI brief", async ({ page }) => {
        await page.goto(DEAL_URL);
        await expectNoViolations(page);

        const section = page.getByTestId("deal-brief");
        await section.getByRole("button", { name: "Draft my negotiation brief" }).click();
        await expect(page.getByTestId("deal-brief-output").getByText("How to negotiate")).toBeVisible();
        await expectNoViolations(page);
      });

      test("contact page", async ({ page }) => {
        await page.goto("/contact");
        await expectNoViolations(page);
      });
    });
  }

  test.describe("mobile viewport", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    for (const path of ["/", "/research", DEAL_URL]) {
      test(`no violations at 390px: ${path}`, async ({ page }) => {
        await page.goto(path);
        await expectNoViolations(page);
      });
    }
  });
});
