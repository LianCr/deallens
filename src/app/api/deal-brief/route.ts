import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { executeGraphQL } from "@/graphql/yoga";
import { buildDealFacts, factsBlock } from "@/ai/dealFacts";
import { BRIEF_SYSTEM_PROMPT } from "@/ai/prompts";
import { briefCacheKey, getAiGuard, getBriefCache } from "@/ai/guard";
import { titleCase } from "@/lib/vehicleUrl";
import { annualFuelCost, DEFAULT_DOLLARS_PER_GALLON, DEFAULT_MILES_PER_YEAR } from "@/domain/fuelCost";
import type { MarketEvent, PriceBucket, PricePoint, Verdict } from "@/domain/types";

/**
 * AI deal brief — streaming negotiation notes for one dealer quote.
 *
 * The route accepts only the four identifiers (make, year, model, quote)
 * and recomputes the PriceContext in-process through the same GraphQL
 * gateway the page uses. It never trusts numbers from the client, so
 * "AI narrates, math decides" is enforced server-side, not by convention.
 *
 * Response modes (x-deallens-ai header): "mock" (MOCK_AI=1, CI/E2E),
 * "cache" (finished brief replayed), "live" (streamed from the API).
 */
export const runtime = "nodejs";

/** Same bounds the deal page enforces on its URL params. */
const BodySchema = z.object({
  make: z.string().trim().min(1).max(40),
  year: z.number().int().min(1980).max(2035),
  model: z.string().trim().min(1).max(60),
  quote: z.number().int().min(1).max(5_000_000),
});

interface PriceContextData {
  quote: number;
  verdict: Verdict;
  percentile: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  distribution: PriceBucket[];
  history: PricePoint[];
  events: MarketEvent[];
  dataSource: "REAL" | "DEMO";
}

const MOCK_BRIEF = [
  "**What the numbers say**\nThis quote sits close to the middle of the demo market for this vehicle — neither a steal nor an outlier.\n\n",
  "**How to negotiate**\nAnchor on the median shown above and ask the dealer to walk you from their number to it, line by line.\n\n",
  "**What to watch for**\nThese pricing figures are a demo dataset; treat the shape of the argument, not the digits, as the takeaway.",
];

const clientIp = (request: Request): string =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

const textResponse = (body: string, mode: "cache" | "mock"): Response =>
  new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "x-deallens-ai": mode },
  });

const jsonError = (status: number, reason: string, message: string): Response =>
  Response.json({ reason, message }, { status });

/** Deterministic chunked stream so E2E can assert progressive rendering. */
function mockStream(): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of MOCK_BRIEF) {
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

export async function POST(request: Request): Promise<Response> {
  let parsedBody: z.infer<typeof BodySchema>;
  try {
    parsedBody = BodySchema.parse(await request.json());
  } catch {
    return jsonError(400, "bad-request", "Send { make, year, model, quote }.");
  }
  const { make, year, model, quote } = parsedBody;

  // Rate limits apply in every mode so the 429 path is testable in CI.
  const verdict = getAiGuard().check(clientIp(request));
  if (!verdict.ok) return jsonError(429, verdict.reason, verdict.message);

  if (process.env.MOCK_AI === "1") return mockStream();

  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonError(
      503,
      "no-key",
      "This deployment has no ANTHROPIC_API_KEY configured. Everything else works — bring your own key to enable AI briefs.",
    );
  }

  const cacheKey = briefCacheKey(make, year, model, quote);
  const cached = getBriefCache().get(cacheKey);
  if (cached !== undefined) return textResponse(cached, "cache");

  // Recompute the context server-side — the client's numbers are never used.
  let priceContext: PriceContextData;
  let fuelEconomy: { combinedMpg: number } | null;
  try {
    [{ priceContext }, fuelEconomy] = await Promise.all([
      executeGraphQL<{ priceContext: PriceContextData }>(
        `query BriefDeal($make: String!, $model: String!, $year: Int!, $quote: Int!) {
          priceContext(make: $make, model: $model, year: $year, quote: $quote) {
            quote verdict percentile p25 median p75
            distribution { lo hi count }
            history { month price }
            events { month title kind }
            dataSource
          }
        }`,
        { make, model, year, quote },
      ),
      executeGraphQL<{ fuelEconomy: { combinedMpg: number } | null }>(
        `query BriefFuel($make: String!, $model: String!, $year: Int!) {
          fuelEconomy(make: $make, model: $model, year: $year) { combinedMpg }
        }`,
        { make, model, year },
      ).then(
        (data) => data.fuelEconomy,
        () => null,
      ),
    ]);
  } catch {
    return jsonError(502, "context-unavailable", "Couldn't compute the pricing context for this vehicle.");
  }

  const fuelCost = fuelEconomy ? annualFuelCost({ combinedMpg: fuelEconomy.combinedMpg }) : null;
  const facts = buildDealFacts({
    vehicleName: `${year} ${titleCase(make)} ${titleCase(model)}`,
    quote: priceContext.quote,
    verdict: priceContext.verdict,
    percentile: priceContext.percentile,
    p25: priceContext.p25,
    median: priceContext.median,
    p75: priceContext.p75,
    history: priceContext.history,
    events: priceContext.events,
    dataSource: priceContext.dataSource,
    fuel:
      fuelEconomy && fuelCost !== null
        ? {
            annualCost: fuelCost,
            combinedMpg: fuelEconomy.combinedMpg,
            milesPerYear: DEFAULT_MILES_PER_YEAR,
            dollarsPerGallon: DEFAULT_DOLLARS_PER_GALLON,
          }
        : null,
  });

  const anthropic = new Anthropic();
  const stream = anthropic.messages.stream({
    model: "claude-opus-4-8",
    max_tokens: 600,
    output_config: { effort: "low" },
    system: BRIEF_SYSTEM_PROMPT,
    messages: [{ role: "user", content: `FACTS:\n${factsBlock(facts)}` }],
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
        () => {
          if (fullText.length > 0) getBriefCache().set(cacheKey, fullText);
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
