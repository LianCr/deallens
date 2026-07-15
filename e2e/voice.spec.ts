import { test, expect } from "@playwright/test";

/**
 * Voice input on the NL finder. Real speech recognition can't run in
 * CI (no microphone, and Chromium's service needs Google servers), so
 * an init script installs a deterministic fake SpeechRecognition
 * before any page script runs — the app's own feature detection picks
 * it up and the full interim → final → manual-submit path is exercised
 * in every browser. Firefox, run WITHOUT the fake, proves the honest
 * degradation: no API, no button.
 */

/**
 * Emits two interim chunks and then the final utterance, mimicking
 * Chrome's timing. Serialized into the page, so no imports here.
 * MediaRecorder is disabled alongside so these tests exercise the
 * browser tier even though the E2E server has MOCK_STT enabled.
 */
const FAKE_SPEECH_INIT = `
  class FakeSpeechRecognition {
    constructor() {
      this.lang = "";
      this.interimResults = false;
      this.continuous = false;
      this.onresult = null;
      this.onerror = null;
      this.onend = null;
    }
    _emit(text, isFinal) {
      const alternative = { transcript: text };
      const result = [alternative];
      result.isFinal = isFinal;
      if (this.onresult) this.onresult({ results: [result] });
    }
    start() {
      setTimeout(() => this._emit("reliable family", false), 50);
      setTimeout(() => this._emit("reliable family SUV under", false), 120);
      setTimeout(() => {
        this._emit("reliable family SUV under $30k", true);
        if (this.onend) this.onend();
      }, 200);
    }
    stop() {
      if (this.onend) this.onend();
    }
    abort() {
      if (this.onend) this.onend();
    }
  }
  window.SpeechRecognition = FakeSpeechRecognition;
  Object.defineProperty(window, "MediaRecorder", { value: undefined, configurable: true });
`;

/**
 * The tier-2 pipeline faked at the browser boundary: getUserMedia hands
 * out a stub stream and MediaRecorder emits one chunk on stop. The
 * transcript itself comes from the real /api/transcribe route running
 * in MOCK_STT mode — the full client → route → response path is live.
 */
const FAKE_RECORDER_INIT = `
  if (!navigator.mediaDevices) {
    Object.defineProperty(navigator, "mediaDevices", { value: {}, configurable: true });
  }
  navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [] });
  Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true });
  Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true });
  class FakeMediaRecorder {
    constructor() {
      this.mimeType = "audio/webm";
      this.ondataavailable = null;
      this.onstop = null;
    }
    static isTypeSupported() { return true; }
    start() {}
    stop() {
      if (this.ondataavailable) {
        this.ondataavailable({ data: new Blob(["fake-audio"], { type: "audio/webm" }) });
      }
      if (this.onstop) this.onstop();
    }
  }
  window.MediaRecorder = FakeMediaRecorder;
  Object.defineProperty(window, "AudioContext", { value: undefined, configurable: true });
  Object.defineProperty(window, "webkitAudioContext", { value: undefined, configurable: true });
`;

test("dictation streams into the finder input and submission stays manual", async ({
  page,
}) => {
  await page.addInitScript(FAKE_SPEECH_INIT);
  await page.goto("/");

  const finder = page.getByTestId("nl-finder");
  const input = finder.getByTestId("nl-finder-input");
  const mic = finder.getByTestId("mic-button");

  // The fake API is detected, so the mic button hydrates in.
  await expect(mic).toBeVisible();

  await mic.click();
  await expect(mic).toHaveAttribute("aria-pressed", "true");
  await expect(finder.getByTestId("mic-status")).toHaveText("Listening…");

  // The final utterance lands in the input — and nothing auto-submits:
  // no candidate cards until the user presses the button themselves.
  await expect(input).toHaveValue("reliable family SUV under $30k");
  await expect(mic).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("nl-finder-card")).toHaveCount(0);

  // The heard text is editable before it reaches the model.
  await input.fill("reliable family SUV under $30k, low mileage");

  await finder.getByRole("button", { name: "Find candidates" }).click();
  await expect(page.getByTestId("nl-finder-card")).toHaveCount(3);
});

test("dictation works on the deal page's ask input too, and asking stays manual", async ({
  page,
}) => {
  await page.addInitScript(FAKE_SPEECH_INIT);
  await page.goto("/deal/honda/2022/civic?quote=24500");

  const thread = page.getByTestId("ask-thread");
  const input = page.locator("#deal-ask-question");
  await input.scrollIntoViewIfNeeded();

  const mic = thread.getByTestId("mic-button");
  await expect(mic).toBeVisible();
  await mic.click();

  // The fake utterance is finder-flavored, but the plumbing is shared:
  // final text lands editable, and no answer streams until Ask.
  await expect(input).toHaveValue("reliable family SUV under $30k");
  await expect(thread.getByTestId("ask-answer")).toHaveCount(0);

  await input.fill("Is this the right month to buy?");
  await thread.getByRole("button", { name: "Ask" }).click();
  await expect(thread.getByTestId("ask-answer")).toHaveCount(1);
});

test("the mic discloses that the browser's speech service handles the audio", async ({
  page,
}) => {
  await page.addInitScript(FAKE_SPEECH_INIT);
  await page.goto("/");

  await expect(page.getByTestId("mic-button")).toHaveAttribute(
    "title",
    /browser's speech service/,
  );
});

test("the server tier records, transcribes via the real route, and stays manual", async ({
  page,
}) => {
  // No SpeechRecognition fake here: the mic must pick the server tier
  // on its own (the E2E server runs MOCK_STT=1, so the probe says yes).
  await page.addInitScript(FAKE_RECORDER_INIT);
  await page.goto("/");

  const finder = page.getByTestId("nl-finder");
  const input = finder.getByTestId("nl-finder-input");
  const mic = finder.getByTestId("mic-button");
  await expect(mic).toBeVisible();
  await expect(mic).toHaveAttribute("title", /deployment's speech service/);

  await mic.click();
  await expect(finder.getByTestId("mic-status")).toHaveText(/Recording/);

  await mic.click(); // stop → upload → mock transcript comes back
  await expect(input).toHaveValue(/Mock transcription/);

  // Editable, never auto-submitted — same contract as the browser tier.
  await expect(page.getByTestId("nl-finder-card")).toHaveCount(0);
  await input.fill("reliable family SUV under $30k");
  await finder.getByRole("button", { name: "Find candidates" }).click();
  await expect(page.getByTestId("nl-finder-card")).toHaveCount(3);
});

test("Firefox gains dictation through the server tier", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "firefox",
    "Firefox has no Web Speech API — the interesting browser for tier 2",
  );
  await page.addInitScript(FAKE_RECORDER_INIT);
  await page.goto("/");

  const finder = page.getByTestId("nl-finder");
  const mic = finder.getByTestId("mic-button");
  await expect(mic).toBeVisible();
  await mic.click();
  await expect(finder.getByTestId("mic-status")).toHaveText(/Recording/);
  await mic.click();
  await expect(finder.getByTestId("nl-finder-input")).toHaveValue(/Mock transcription/);
});

test("no Web Speech and no server model → no mic button at all", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "firefox",
    "Firefox is the real-world no-Web-Speech browser; others get the fake installed",
  );
  // This deployment-without-a-key scenario is simulated by answering
  // the availability probe with "disabled".
  await page.route("**/api/transcribe", (route) =>
    route.fulfill({ json: { enabled: false } }),
  );
  await page.goto("/");

  // The finder itself is present and typable — only the mic is
  // feature-detected out. Honest degradation, not a dead button.
  const finder = page.getByTestId("nl-finder");
  await expect(finder.getByTestId("nl-finder-input")).toBeVisible();
  await expect(finder.getByTestId("mic-button")).toHaveCount(0);
});
