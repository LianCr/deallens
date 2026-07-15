import { test, expect } from "@playwright/test";

/**
 * Voice replies. The audio pipeline is real up to the browser boundary:
 * the client fetches /api/speak (running in MOCK_TTS mode — a valid
 * silent WAV) and only the Audio element is faked, because headless
 * browsers block autoplay nondeterministically. Pause/resume semantics
 * are asserted through the button's state machine.
 */

const DEAL_URL = "/deal/honda/2022/civic?quote=24500";

const FAKE_AUDIO_INIT = `
  class FakeAudio {
    constructor(src) {
      this.src = src;
      this.currentTime = 0;
      this.paused = true;
      this.onended = null;
      this.onerror = null;
      FakeAudio.instances.push(this);
    }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  FakeAudio.instances = [];
  window.Audio = FakeAudio;
`;

async function askQuestion(page: import("@playwright/test").Page, question: string) {
  const input = page.locator("#deal-ask-question");
  await input.scrollIntoViewIfNeeded();
  await input.fill(question);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
}

test("a new answer speaks on its own; tap pauses, tap again resumes", async ({
  page,
}) => {
  await page.addInitScript(FAKE_AUDIO_INIT);
  await page.goto(DEAL_URL);

  const spoken = page.waitForResponse("**/api/speak");
  await askQuestion(page, "Is this the right month to buy?");

  // The answer commits, the audio is fetched for real, and it auto-plays.
  const speaker = page.getByTestId("speaker-button");
  expect((await spoken).status()).toBe(200);
  await expect(speaker).toHaveAttribute("data-state", "playing");
  await expect(speaker).toHaveAttribute("aria-pressed", "true");

  // Pause keeps the spot…
  await speaker.click();
  await expect(speaker).toHaveAttribute("data-state", "paused");
  await expect(speaker).toHaveAccessibleName("Resume voice reply");

  // …and resuming picks it back up without reloading the audio.
  await speaker.click();
  await expect(speaker).toHaveAttribute("data-state", "playing");
});

test("the global toggle mutes auto-speak for the next answer", async ({ page }) => {
  await page.addInitScript(FAKE_AUDIO_INIT);
  await page.goto(DEAL_URL);

  const toggle = page.getByTestId("voice-replies-toggle");
  await toggle.scrollIntoViewIfNeeded();
  await expect(toggle).toHaveAttribute("aria-pressed", "true"); // on by default
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  await askQuestion(page, "Is this the right month to buy?");
  const speaker = page.getByTestId("speaker-button");
  await expect(speaker).toBeVisible();
  // Muted: no autoplay — but the manual button still works.
  await expect(speaker).toHaveAttribute("data-state", "idle");
  await speaker.click();
  await expect(speaker).toHaveAttribute("data-state", "playing");
});

test("the brief gets a listen button and never auto-plays", async ({ page }) => {
  await page.addInitScript(FAKE_AUDIO_INIT);
  await page.goto(DEAL_URL);

  const generate = page.getByRole("button", { name: /negotiation brief/i });
  await generate.scrollIntoViewIfNeeded();
  await generate.click();
  await expect(page.getByText("Listen to this brief")).toBeVisible();

  const speaker = page.getByTestId("speaker-button").first();
  await expect(speaker).toHaveAttribute("data-state", "idle"); // no autoplay
  await speaker.click();
  await expect(speaker).toHaveAttribute("data-state", "playing");
});
