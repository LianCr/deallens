/**
 * Capture portfolio screenshots against a running production server.
 * Usage: PLAYWRIGHT_BASE_URL=http://localhost:3001 node scripts/capture-screenshots.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const base = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const out = join(process.cwd(), "docs", "screenshots");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto(base + "/", { waitUntil: "networkidle" });
await page.screenshot({ path: join(out, "m7-landing.png"), fullPage: true });

await page.goto(base + "/deal/honda/2022/civic?quote=24500", {
  waitUntil: "networkidle",
});
await page.screenshot({
  path: join(out, "m4-dashboard-full.png"),
  fullPage: true,
});

// Timeline pin interaction for a focused crop
const timeline = page.getByTestId("price-history-timeline");
if (await timeline.count()) {
  await timeline.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(out, "m4-timeline-pinned.png"),
    fullPage: false,
  });
}

await page.goto(base + "/contact?vehicle=2022%20Honda%20Civic&offer=24500", {
  waitUntil: "networkidle",
});
await page.screenshot({ path: join(out, "m5-contact.png"), fullPage: true });

await browser.close();
console.log("Wrote portfolio screenshots to docs/screenshots/");
