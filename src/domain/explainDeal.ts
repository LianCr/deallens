/**
 * Trust Trace — turn a quote + market sample into an auditable receipt.
 *
 * Reuses `assessDeal` / `percentileValue` so the UI never invents a
 * second scoring path. Steps are ordered prose the TrustTrace component
 * can render without an LLM.
 */
import { percentileValue } from "./percentile";
import {
  assessDeal,
  GREAT_DEAL_MAX_PERCENTILE,
  FAIR_MAX_PERCENTILE,
  MIN_SAMPLE_SIZE,
  type DealAssessment,
} from "./verdict";
import type { Verdict } from "./types";

export type ExplainBand = "GREAT" | "FAIR" | "ABOVE" | "NONE";

export interface ExplainStep {
  id: string;
  /** Short label, e.g. "Sample size". */
  label: string;
  /** One-line audit finding. */
  detail: string;
}

export interface DealExplanation {
  assessment: DealAssessment;
  sampleSize: number;
  minSampleSize: number;
  sufficient: boolean;
  p25: number | null;
  median: number | null;
  p75: number | null;
  /** Same as assessment.percentile; duplicated for call-site convenience. */
  percentile: number | null;
  band: ExplainBand;
  steps: ExplainStep[];
  /** One-line summary for the collapsed Trust Trace header. */
  summary: string;
}

function bandFromVerdict(verdict: Verdict): ExplainBand {
  switch (verdict) {
    case "GREAT_DEAL":
      return "GREAT";
    case "FAIR":
      return "FAIR";
    case "ABOVE_MARKET":
      return "ABOVE";
    case "INSUFFICIENT_DATA":
      return "NONE";
  }
}

function dollars(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/**
 * Explain how a dealer quote becomes a verdict — pure, deterministic,
 * identical on server and client.
 */
export function explainDeal(
  quote: number,
  marketPrices: readonly number[],
): DealExplanation {
  const assessment = assessDeal(quote, marketPrices);
  const sampleSize = marketPrices.length;
  const sufficient = sampleSize >= MIN_SAMPLE_SIZE;
  const p25 = percentileValue(marketPrices, 25);
  const median = percentileValue(marketPrices, 50);
  const p75 = percentileValue(marketPrices, 75);
  const band = bandFromVerdict(assessment.verdict);
  const steps: ExplainStep[] = [];

  steps.push({
    id: "sample",
    label: "Sample size",
    detail: sufficient
      ? `${sampleSize} comparable listings (≥ ${MIN_SAMPLE_SIZE} required). Enough to score.`
      : `${sampleSize} comparable listing${sampleSize === 1 ? "" : "s"} (< ${MIN_SAMPLE_SIZE} required). Too thin — we refuse a percentile.`,
  });

  if (p25 !== null && median !== null && p75 !== null) {
    steps.push({
      id: "quartiles",
      label: "Market band",
      detail: `P25 ${dollars(p25)} · median ${dollars(median)} · P75 ${dollars(p75)}. Your quote: ${dollars(quote)}.`,
    });
  } else {
    steps.push({
      id: "quartiles",
      label: "Market band",
      detail: "No listings to form a price band — and we won't invent one.",
    });
  }

  if (assessment.percentile !== null) {
    const p = Math.round(assessment.percentile);
    steps.push({
      id: "percentile",
      label: "Percentile",
      detail: `Quote sits at about the ${p}th percentile — cheaper than roughly ${100 - p}% of comparable listings (mid-rank ties).`,
    });
  } else {
    steps.push({
      id: "percentile",
      label: "Percentile",
      detail: "Not computed. A percentile on a handful of points would be noise dressed as confidence.",
    });
  }

  steps.push({
    id: "thresholds",
    label: "Verdict rules",
    detail: `≤ P${GREAT_DEAL_MAX_PERCENTILE} → Great deal · ≤ P${FAIR_MAX_PERCENTILE} → Fair · else Above market. Applied only when the sample is sufficient.`,
  });

  if (assessment.verdict === "INSUFFICIENT_DATA") {
    steps.push({
      id: "outcome",
      label: "Outcome",
      detail: `INSUFFICIENT_DATA — sample below ${MIN_SAMPLE_SIZE}. No Great / Fair / Above label.`,
    });
  } else {
    const label =
      assessment.verdict === "GREAT_DEAL"
        ? "Great deal"
        : assessment.verdict === "FAIR"
          ? "Fair"
          : "Above market";
    steps.push({
      id: "outcome",
      label: "Outcome",
      detail: `${label} (band ${band}) from the rules above — same function the hero renders.`,
    });
  }

  const summary = sufficient
    ? `How we scored this · n=${sampleSize} · P${Math.round(assessment.percentile ?? 0)} · ${
        band === "GREAT"
          ? `Great ≤ P${GREAT_DEAL_MAX_PERCENTILE}`
          : band === "FAIR"
            ? `Fair ≤ P${FAIR_MAX_PERCENTILE}`
            : `Above > P${FAIR_MAX_PERCENTILE}`
      }`
    : `How we scored this · n=${sampleSize} · insufficient (< ${MIN_SAMPLE_SIZE}) · no verdict`;

  return {
    assessment,
    sampleSize,
    minSampleSize: MIN_SAMPLE_SIZE,
    sufficient,
    p25,
    median,
    p75,
    percentile: assessment.percentile,
    band,
    steps,
    summary,
  };
}
