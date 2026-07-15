import Anthropic from "@anthropic-ai/sdk";
import { factsBlock, type DealFacts } from "@/ai/dealFacts";
import { loadDealFacts } from "@/ai/loadDealFacts";
import { ASK_SYSTEM_PROMPT } from "@/ai/prompts";
import { getAiGuard } from "@/ai/guard";
import { AskBodySchema, type AskBody } from "./schema";

/**
 * Grounded follow-up Q&A — "Ask about this deal".
 *
 * Same grounding contract as /api/deal-brief: the route accepts only
 * the four deal identifiers plus the question text, recomputes the
 * FACTS block server-side (src/ai/loadDealFacts.ts) on every call, and
 * replays the client's prior turns as conversation history. The client
 * never supplies a number that reaches the prompt — turn text is
 * conversation, FACTS are the only arithmetic.
 *
 * Unlike the brief there is no response cache: free-text questions
 * rarely repeat, so the rate-limit guard (shared with all AI features —
 * one budget) is the spend ceiling.
 *
 * Response modes (x-deallens-ai header): "mock" (MOCK_AI=1, CI/E2E),
 * "live" (streamed from the API).
 */
export const runtime = "nodejs";

const MOCK_ANSWER = [
  "Grounded answer: this quote sits close to the demo market median, ",
  "so anchor on that median and ask the dealer to justify the gap. ",
  "These pricing figures are a demo dataset — the reasoning transfers, the digits don't.",
];

const clientIp = (request: Request): string =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

const jsonError = (status: number, reason: string, message: string): Response =>
  Response.json({ reason, message }, { status });

/** Deterministic chunked stream so E2E can assert progressive rendering. */
function mockStream(): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of MOCK_ANSWER) {
        controller.enqueue(encoder.encode(chunk));
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      controller.close();
    },
  });
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "x-deallens-ai": "mock" },
  });
}

/**
 * Replays the thread with the server-built FACTS block injected into
 * the first user message — the model always converses over facts this
 * request computed, never facts the client claims.
 */
function buildMessages(
  facts: DealFacts,
  turns: Array<{ q: string; a: string }>,
  question: string,
): Anthropic.MessageParam[] {
  const withFacts = (q: string, first: boolean): string =>
    first ? `FACTS:\n${factsBlock(facts)}\n\nQUESTION:\n${q}` : `QUESTION:\n${q}`;
  const messages: Anthropic.MessageParam[] = [];
  turns.forEach((turn, index) => {
    messages.push({ role: "user", content: withFacts(turn.q, index === 0) });
    messages.push({ role: "assistant", content: turn.a });
  });
  messages.push({ role: "user", content: withFacts(question, turns.length === 0) });
  return messages;
}

export async function POST(request: Request): Promise<Response> {
  let parsedBody: AskBody;
  try {
    parsedBody = AskBodySchema.parse(await request.json());
  } catch {
    return jsonError(400, "bad-request", "Send { make, year, model, quote, question, turns? }.");
  }
  const { make, year, model, quote, question, turns } = parsedBody;

  // Rate limits apply in every mode so the 429 path is testable in CI.
  const verdict = getAiGuard().check(clientIp(request));
  if (!verdict.ok) return jsonError(429, verdict.reason, verdict.message);

  if (process.env.MOCK_AI === "1") return mockStream();

  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonError(
      503,
      "no-key",
      "This deployment has no ANTHROPIC_API_KEY configured. Everything else works — bring your own key to enable AI answers.",
    );
  }

  // Recompute the context server-side — the client's numbers are never used.
  let facts: DealFacts;
  try {
    facts = await loadDealFacts({ make, year, model, quote });
  } catch {
    return jsonError(502, "context-unavailable", "Couldn't compute the pricing context for this vehicle.");
  }

  const anthropic = new Anthropic();
  const stream = anthropic.messages.stream({
    model: "claude-opus-4-8",
    max_tokens: 300,
    output_config: { effort: "low" },
    system: ASK_SYSTEM_PROMPT,
    messages: buildMessages(facts, turns, question),
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on("text", (delta) => {
        controller.enqueue(encoder.encode(delta));
      });
      stream.finalMessage().then(
        () => controller.close(),
        (error) => controller.error(error),
      );
    },
    cancel() {
      stream.abort();
    },
  });
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "x-deallens-ai": "live" },
  });
}
