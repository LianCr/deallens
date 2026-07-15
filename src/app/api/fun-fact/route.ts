import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { FUN_FACT_SYSTEM_PROMPT } from "@/ai/prompts";
import { getAiGuard, getFunFactCache } from "@/ai/guard";
import { webSearchTools } from "@/ai/webSearch";

/**
 * "One more thing" — one true, delightful fact about the exact vehicle.
 *
 * No FACTS block here (nothing on this route touches pricing); the
 * honesty risk is fabrication, which the prompt handles: the fact must
 * be anchored to this generation, web-sourced claims name their source,
 * and "no verified party tricks" is an acceptable answer. Facts are
 * keyed by vehicle alone and cached for a week, so each model's story
 * is generated once and then served free.
 *
 * Response modes (x-deallens-ai header): "mock", "cache", "live" —
 * same taxonomy as deal-brief.
 */
export const runtime = "nodejs";

const BodySchema = z.object({
  make: z.string().trim().min(1).max(40),
  year: z.number().int().min(1980).max(2035),
  model: z.string().trim().min(1).max(60),
});

const MOCK_FACT =
  "Mock fun fact: this car's designers hid a small delight in plain sight — a deterministic one, for CI. (Real deployments get the real story.)";

/** Searches per fact; one good source is enough. */
const FUN_FACT_SEARCH_MAX_USES = 2;

const clientIp = (request: Request): string =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

const textResponse = (body: string, mode: "cache" | "mock"): Response =>
  new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "x-deallens-ai": mode },
  });

const jsonError = (status: number, reason: string, message: string): Response =>
  Response.json({ reason, message }, { status });

export async function POST(request: Request): Promise<Response> {
  let parsedBody: z.infer<typeof BodySchema>;
  try {
    parsedBody = BodySchema.parse(await request.json());
  } catch {
    return jsonError(400, "bad-request", "Send { make, year, model }.");
  }
  const { make, year, model } = parsedBody;

  // Rate limits apply in every mode so the 429 path is testable in CI.
  const verdict = getAiGuard().check(clientIp(request));
  if (!verdict.ok) return jsonError(429, verdict.reason, verdict.message);

  if (process.env.MOCK_AI === "1") return textResponse(MOCK_FACT, "mock");

  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonError(
      503,
      "no-key",
      "This deployment has no ANTHROPIC_API_KEY configured — no storyteller today.",
    );
  }

  const cacheKey = `${make.toLowerCase()}/${year}/${model.toLowerCase()}`;
  const cached = getFunFactCache().get(cacheKey);
  if (cached !== undefined) return textResponse(cached, "cache");

  const anthropic = new Anthropic();
  const stream = anthropic.messages.stream({
    model: "claude-opus-4-8",
    max_tokens: 500,
    output_config: { effort: "low" },
    system: FUN_FACT_SYSTEM_PROMPT,
    tools: webSearchTools(FUN_FACT_SEARCH_MAX_USES),
    messages: [{ role: "user", content: `VEHICLE: ${year} ${make} ${model}` }],
  });

  const encoder = new TextEncoder();
  let fullText = "";
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on("text", (delta) => {
        fullText += delta;
        controller.enqueue(encoder.encode(delta));
      });
      stream.finalMessage().then(
        (message) => {
          if (fullText.length > 0 && message.stop_reason !== "pause_turn") {
            getFunFactCache().set(cacheKey, fullText);
          }
          controller.close();
        },
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
