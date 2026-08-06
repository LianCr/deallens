/**
 * Structured AI research report grounded on EvidenceBundle.
 * Validates that option IDs ⊆ comparable ids; strips hallucinations.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getAiGuard } from "@/ai/guard";
import { buildResearchFacts, RESEARCH_REPORT_SYSTEM } from "./evidenceBundle";
import type {
  EvidenceBundle,
  StructuredResearchRecommendation,
} from "./types";

const ReportSchema = z.object({
  recommendation: z.string(),
  reasoning: z.string(),
  bestValueOption: z.string().optional(),
  cheapestAcceptableOption: z.string().optional(),
  premiumOption: z.string().optional(),
  risks: z.array(z.string()),
  followUpQuestions: z.array(z.string()),
  confidenceExplanation: z.string(),
  evidenceIds: z.array(z.string()),
});

const MOCK_REPORT: StructuredResearchRecommendation = {
  recommendation:
    "This looks like a fair-to-good buy relative to the cited comparables — confirm trim and history before committing.",
  reasoning:
    "Target price sits near the middle of the comparable set in the FACTS block; confidence is limited by sample gaps.",
  risks: [
    "Some comparables are missing trim — apples-to-apples may be weaker than the percentile suggests.",
    "Listing pages change; re-check live asking prices before negotiating.",
  ],
  followUpQuestions: [
    "Has a pre-purchase inspection been scheduled?",
    "Does the asking price include fees and taxes?",
  ],
  confidenceExplanation:
    "Confidence follows sample size and field completeness in the FACTS block.",
  evidenceIds: [],
};

function allowedIds(bundle: EvidenceBundle): Set<string> {
  return new Set([
    bundle.target.id,
    ...bundle.comparables.included.map((o) => o.id),
    ...bundle.comparables.included.map((o) => o.source.id),
  ]);
}

export function validateResearchReport(
  raw: StructuredResearchRecommendation,
  bundle: EvidenceBundle,
): StructuredResearchRecommendation {
  const allow = allowedIds(bundle);
  const pick = (id?: string) => (id && allow.has(id) ? id : undefined);
  const evidenceIds = raw.evidenceIds.filter((id) => allow.has(id));
  // If model omitted ids, cite included comparables.
  const fallbackIds = bundle.comparables.included.slice(0, 5).map((o) => o.id);
  return {
    ...raw,
    bestValueOption: pick(raw.bestValueOption),
    cheapestAcceptableOption: pick(raw.cheapestAcceptableOption),
    premiumOption: pick(raw.premiumOption),
    evidenceIds: evidenceIds.length > 0 ? evidenceIds : fallbackIds,
    risks: raw.risks.slice(0, 6),
    followUpQuestions: raw.followUpQuestions.slice(0, 5),
  };
}

export async function generateResearchReport(
  bundle: EvidenceBundle,
  clientIp: string,
): Promise<StructuredResearchRecommendation | null> {
  if (process.env.MOCK_AI === "1") {
    return validateResearchReport(
      {
        ...MOCK_REPORT,
        evidenceIds: bundle.comparables.included.slice(0, 3).map((o) => o.id),
        bestValueOption: bundle.comparables.included[0]?.id,
        cheapestAcceptableOption: [...bundle.comparables.included].sort(
          (a, b) => a.price - b.price,
        )[0]?.id,
        premiumOption: [...bundle.comparables.included].sort(
          (a, b) => b.price - a.price,
        )[0]?.id,
      },
      bundle,
    );
  }

  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;

  const guard = getAiGuard();
  const limited = guard.check(clientIp);
  if (!limited.ok) return null;

  const facts = buildResearchFacts(bundle);
  const client = new Anthropic({ apiKey: key });
  const response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 1200,
    system: RESEARCH_REPORT_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Write the research recommendation JSON from these FACTS only:\n\n${facts}`,
      },
    ],
    output_config: {
      format: zodOutputFormat(ReportSchema),
    },
  });

  const parsed = response.parsed_output;
  if (!parsed) return null;
  return validateResearchReport(parsed, bundle);
}
