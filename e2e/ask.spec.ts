import { test, expect } from "@playwright/test";

/**
 * Follow-up Q&A under MOCK_AI=1 (see playwright.config.ts): /api/deal-ask
 * returns a deterministic streamed answer, so these tests cost nothing
 * and never flake on a live model. Grounding labels and the turn-replay
 * contract are asserted exactly as production renders them.
 */

const DEAL_URL = "/deal/honda/2022/civic?quote=24500";
const FIRST_QUESTION = "Is this a fair price for this car?";

test("a question streams a grounded, AI-labeled answer", async ({ page }) => {
  await page.goto(DEAL_URL);

  const thread = page.getByTestId("ask-thread");
  await thread.getByLabel("Ask about this deal").fill(FIRST_QUESTION);

  const responsePromise = page.waitForResponse("**/api/deal-ask");
  await thread.getByRole("button", { name: "Ask" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  expect(response.headers()["x-deallens-ai"]).toBe("mock");

  // The question echoes as a turn and the mock answer streams in.
  await expect(thread.getByText(FIRST_QUESTION)).toBeVisible();
  await expect(thread.getByText(/the reasoning transfers, the digits don't/)).toBeVisible();
  // Every answer bubble carries the grounding badge.
  await expect(
    thread.getByText("AI-generated · grounded in the numbers above"),
  ).toBeVisible();
  // Ready for the next question.
  await expect(thread.getByLabel("Ask about this deal")).toHaveValue("");
});

test("a second question replays the first turn to the server", async ({ page }) => {
  await page.goto(DEAL_URL);

  const thread = page.getByTestId("ask-thread");
  await thread.getByLabel("Ask about this deal").fill(FIRST_QUESTION);
  await thread.getByRole("button", { name: "Ask" }).click();
  await expect(thread.getByText(/the reasoning transfers/)).toBeVisible();

  await thread.getByLabel("Ask about this deal").fill("What about the fuel cost?");
  const requestPromise = page.waitForRequest("**/api/deal-ask");
  await thread.getByRole("button", { name: "Ask" }).click();
  const request = await requestPromise;

  // The finished first turn rides along; the server re-injects FACTS.
  const body = request.postDataJSON() as {
    question: string;
    turns: Array<{ q: string; a: string }>;
  };
  expect(body.question).toBe("What about the fuel cost?");
  expect(body.turns).toHaveLength(1);
  expect(body.turns[0]!.q).toBe(FIRST_QUESTION);
  expect(body.turns[0]!.a).toContain("the reasoning transfers");

  // Both turns render, each with its own grounded answer bubble.
  await expect(thread.getByText("What about the fuel cost?")).toBeVisible();
  await expect(thread.getByText(/the reasoning transfers/)).toHaveCount(2);
  await expect(
    thread.getByText("AI-generated · grounded in the numbers above"),
  ).toHaveCount(2);
});
