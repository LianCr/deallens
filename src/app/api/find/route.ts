import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { executeGraphQL } from "@/graphql/yoga";
import { FINDER_SYSTEM_PROMPT } from "@/ai/prompts";
import { getAiGuard } from "@/ai/guard";
import { MAKES, YEARS } from "@/graphql/makes";
import { dealPath } from "@/lib/vehicleUrl";

/**
 * NL finder — natural-language car search, grounded in the real catalog.
 *
 * The model's output is schema-constrained (structured outputs: makes
 * whitelist, supported years), and every candidate is then verified
 * against the live vPIC catalog; a model name vPIC doesn't know is
 * dropped, not shown. Hallucination handling is an honesty mechanism,
 * same as the DEMO badges.
 */
export const runtime = "nodejs";

const BodySchema = z.object({
  query: z.string().trim().min(3).max(300),
});

/**
 * Structured-output schema. Numeric range constraints aren't enforced
 * server-side by structured outputs, so years are stated in the user
 * message and re-checked below; array length is clamped after parsing.
 */
const FinderOutputSchema = z.object({
  candidates: z.array(
    z.object({
      make: z.enum(MAKES),
      year: z.number().int(),
      model: z.string(),
      reason: z.string(),
    }),
  ),
});

export interface FinderCandidate {
  make: string;
  year: number;
  model: string;
  reason: string;
  /** Deep link straight into the deal dashboard. */
  href: string;
}

const MAX_CANDIDATES = 3;

const MOCK_CANDIDATES: FinderCandidate[] = [
  {
    make: "Honda",
    year: 2022,
    model: "CR-V",
    reason: "Roomy, reliable compact SUV that holds value well for family duty.",
    href: dealPath("Honda", 2022, "CR-V"),
  },
  {
    make: "Toyota",
    year: 2022,
    model: "RAV4",
    reason: "The default family SUV pick — strong reliability record and easy resale.",
    href: dealPath("Toyota", 2022, "RAV4"),
  },
  {
    make: "Subaru",
    year: 2022,
    model: "Outback",
    reason: "Wagon practicality with standard all-wheel drive for the same budget.",
    href: dealPath("Subaru", 2022, "Outback"),
  },
];

const clientIp = (request: Request): string =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

const jsonError = (status: number, reason: string, message: string): Response =>
  Response.json({ reason, message }, { status });

/** Keep only candidates the real vPIC catalog confirms, in catalog casing. */
async function verifyAgainstCatalog(
  candidates: Array<{ make: string; year: number; model: string; reason: string }>,
): Promise<{ verified: FinderCandidate[]; dropped: number }> {
  const verified: FinderCandidate[] = [];
  let dropped = 0;
  const catalogCache = new Map<string, string[]>();

  for (const candidate of candidates) {
    const cacheKey = `${candidate.make}/${candidate.year}`;
    let models = catalogCache.get(cacheKey);
    if (!models) {
      try {
        ({ models } = await executeGraphQL<{ models: string[] }>(
          `query FinderModels($make: String!, $year: Int!) { models(make: $make, year: $year) }`,
          { make: candidate.make, year: candidate.year },
        ));
      } catch {
        // Catalog unreachable → we can't verify, so we don't show it.
        dropped += 1;
        continue;
      }
      catalogCache.set(cacheKey, models);
    }
    const match = models.find((m) => m.toLowerCase() === candidate.model.trim().toLowerCase());
    if (!match) {
      dropped += 1;
      continue;
    }
    verified.push({
      make: candidate.make,
      year: candidate.year,
      model: match,
      reason: candidate.reason,
      href: dealPath(candidate.make, candidate.year, match),
    });
  }
  return { verified, dropped };
}

export async function POST(request: Request): Promise<Response> {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return jsonError(400, "bad-request", "Describe what you need in a short sentence (3–300 characters).");
  }

  const verdict = getAiGuard().check(clientIp(request));
  if (!verdict.ok) return jsonError(429, verdict.reason, verdict.message);

  if (process.env.MOCK_AI === "1") {
    return Response.json(
      { candidates: MOCK_CANDIDATES, dropped: 0 },
      { headers: { "x-deallens-ai": "mock" } },
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonError(
      503,
      "no-key",
      "This deployment has no ANTHROPIC_API_KEY configured. Everything else works — bring your own key to enable AI search.",
    );
  }

  const minYear = Math.min(...YEARS);
  const maxYear = Math.max(...YEARS);

  const anthropic = new Anthropic();
  let parsed: z.infer<typeof FinderOutputSchema> | null;
  try {
    const response = await anthropic.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 1000,
      output_config: { effort: "low", format: zodOutputFormat(FinderOutputSchema) },
      system: FINDER_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Allowed makes: ${MAKES.join(", ")}.\nAllowed years: ${minYear}–${maxYear}.\nShopper request: ${body.query}`,
        },
      ],
    });
    parsed = response.parsed_output;
  } catch {
    return jsonError(502, "ai-unavailable", "The AI service is unreachable right now. The picker below works without it.");
  }
  if (!parsed) {
    return jsonError(502, "ai-unavailable", "The AI returned an unusable answer. Try rephrasing, or use the picker below.");
  }

  const inRange = parsed.candidates
    .filter((c) => c.year >= minYear && c.year <= maxYear)
    .slice(0, MAX_CANDIDATES);
  const { verified, dropped } = await verifyAgainstCatalog(inRange);

  return Response.json(
    { candidates: verified, dropped: dropped + (parsed.candidates.length - inRange.length) },
    { headers: { "x-deallens-ai": "live" } },
  );
}
