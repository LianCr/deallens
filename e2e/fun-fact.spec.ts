import { test, expect } from "@playwright/test";

/**
 * "One more thing": the fun-fact reveal. MOCK_AI answers the route
 * deterministically; the Audio element is faked (headless autoplay),
 * but the /api/speak fetch and its storyteller style are real.
 */

const DEAL_URL = "/deal/honda/2022/civic?quote=24500";

const FAKE_AUDIO_INIT = `
  class FakeAudio {
    constructor(src) {
      this.src = src;
      this.paused = true;
      this.onended = null;
      this.onerror = null;
    }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  window.Audio = FakeAudio;
`;

test("the story stays behind the button, streams in on tap, and speaks only when asked", async ({
  page,
}) => {
  await page.addInitScript(FAKE_AUDIO_INIT);

  // Nothing about the fact is fetched during page load.
  let factRequests = 0;
  await page.route("**/api/fun-fact", async (route) => {
    factRequests += 1;
    await route.fallback();
  });
  await page.goto(DEAL_URL);

  const reveal = page.getByTestId("fun-fact-reveal");
  await reveal.scrollIntoViewIfNeeded();
  await expect(reveal).toBeVisible();
  expect(factRequests).toBe(0);

  await reveal.click();
  const card = page.getByTestId("fun-fact-card");
  await expect(card).toContainText("Mock fun fact");
  expect(factRequests).toBe(1);

  // The storyteller voice is opt-in: idle until tapped, then it plays
  // through the real /api/speak route (mock WAV) with the fun style.
  const speaker = card.getByTestId("speaker-button");
  await expect(speaker).toHaveAttribute("data-state", "idle");
  const spoken = page.waitForRequest("**/api/speak");
  await speaker.click();
  const body = (await spoken).postDataJSON() as { style?: string };
  expect(body.style).toBe("storyteller");
  await expect(speaker).toHaveAttribute("data-state", "playing");
});
