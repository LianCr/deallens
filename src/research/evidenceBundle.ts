/**
 * Compress an EvidenceBundle into the FACTS block the research report
 * model may narrate. Same honesty rule as dealFacts: model never invents numbers.
 */

import type { EvidenceBundle } from "./types";

export function buildResearchFacts(bundle: EvidenceBundle): string {
  const { target, comparables, verdict, percentile, collectorMode, dataSource } =
    bundle;
  const lines: string[] = [
    `VEHICLE: ${target.year} ${target.make} ${target.model}${target.trim ? ` ${target.trim}` : ""}`,
    `TARGET_PRICE_USD: ${target.price}`,
    target.mileage != null ? `TARGET_MILEAGE: ${target.mileage}` : null,
    target.location ? `TARGET_LOCATION: ${target.location}` : null,
    `TARGET_SOURCE: ${target.source.sourceUrl}`,
    `COLLECTOR_MODE: ${collectorMode}`,
    `DATA_SOURCE_TAG: ${dataSource}`,
    `COMPARABLE_COUNT: ${comparables.sampleSize}`,
    `MEDIAN_USD: ${comparables.median ?? "null"}`,
    `P25_USD: ${comparables.p25 ?? "null"}`,
    `P75_USD: ${comparables.p75 ?? "null"}`,
    `MEAN_USD: ${comparables.mean ?? "null"}`,
    `PERCENTILE: ${percentile ?? "null"}`,
    `VERDICT: ${verdict}`,
    `CONFIDENCE: ${comparables.confidence} (${comparables.confidenceScore.toFixed(2)})`,
    `MISSING_TRIM_COUNT: ${comparables.missingTrimCount}`,
    `EXCLUSION_COUNT: ${comparables.exclusions.length}`,
  ].filter((l): l is string => l != null);

  lines.push("COMPARABLES:");
  for (const o of comparables.included.slice(0, 14)) {
    lines.push(
      `  - id=${o.id} price=${o.price} year=${o.year} mileage=${o.mileage ?? "?"} trim=${o.trim ?? "?"} url=${o.source.sourceUrl}`,
    );
  }
  if (comparables.exclusions.length > 0) {
    lines.push("EXCLUSIONS (sample):");
    for (const ex of comparables.exclusions.slice(0, 8)) {
      lines.push(`  - id=${ex.itemId} reason=${ex.reason}`);
    }
  }
  lines.push("TRUST_TRACE:");
  for (const step of bundle.explainSteps) {
    lines.push(`  - ${step.label}: ${step.detail}`);
  }
  return lines.join("\n");
}

export const RESEARCH_REPORT_SYSTEM = `You are DealLens research narrates — not a price calculator.
You receive a FACTS block of comparable vehicle listings and deterministic market math.
Rules:
- Never invent listings, prices, percentiles, or URLs.
- Only cite comparable ids that appear in FACTS.
- If VERDICT is INSUFFICIENT_DATA, say so clearly and do not force a buy recommendation.
- Mention confidence and missing trim / exclusion caveats when present.
- Pricing may be DEMO or SEARCH_EXTRACTED — say so honestly.
- Output must match the JSON schema exactly.`;
