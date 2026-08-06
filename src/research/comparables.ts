/**
 * Deterministic normalize / dedupe / comparable selection / confidence.
 * Pure functions — unit-tested; no I/O.
 */

import { percentileValue } from "@/domain/percentile";
import type {
  ComparableExclusion,
  ComparableSet,
  ConfidenceLabel,
  NormalizedOffer,
  PriceObservation,
} from "./types";

const DEFAULT_YEAR_TOLERANCE = 1;
const DEFAULT_MILEAGE_TOLERANCE = 40_000;

function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Collapse duplicate source URLs and near-identical price+mileage twins. */
export function dedupeOffers(offers: readonly NormalizedOffer[]): {
  unique: NormalizedOffer[];
  exclusions: ComparableExclusion[];
} {
  const seenUrl = new Set<string>();
  const seenFingerprint = new Set<string>();
  const unique: NormalizedOffer[] = [];
  const exclusions: ComparableExclusion[] = [];

  for (const offer of offers) {
    const urlKey = offer.source.sourceUrl.split("?")[0] ?? offer.source.sourceUrl;
    const url = urlKey.replace(/\/$/, "");
    if (seenUrl.has(url)) {
      exclusions.push({
        itemId: offer.id,
        reason: "Duplicate of another listing with the same source URL",
      });
      continue;
    }
    const fp = [
      normKey(offer.make),
      normKey(offer.model),
      offer.year,
      offer.price,
      offer.mileage ?? "x",
    ].join("|");
    if (seenFingerprint.has(fp)) {
      exclusions.push({
        itemId: offer.id,
        reason: "Near-duplicate (same year, price, and mileage fingerprint)",
      });
      continue;
    }
    seenUrl.add(url);
    seenFingerprint.add(fp);
    unique.push(offer);
  }
  return { unique, exclusions };
}

export function selectComparables(
  target: NormalizedOffer,
  candidates: readonly NormalizedOffer[],
  opts?: { yearTolerance?: number; mileageTolerance?: number },
): ComparableSet {
  const yearTol = opts?.yearTolerance ?? DEFAULT_YEAR_TOLERANCE;
  const miTol = opts?.mileageTolerance ?? DEFAULT_MILEAGE_TOLERANCE;

  const { unique, exclusions: dedupeExclusions } = dedupeOffers(candidates);
  const exclusions: ComparableExclusion[] = [...dedupeExclusions];
  const included: NormalizedOffer[] = [];

  const targetMake = normKey(target.make);
  const targetModel = normKey(target.model);

  for (const offer of unique) {
    if (offer.id === target.id) continue;

    if (normKey(offer.make) !== targetMake) {
      exclusions.push({ itemId: offer.id, reason: "Different make" });
      continue;
    }
    // Allow model substring match (Civic vs Civic LX in title noise)
    const om = normKey(offer.model);
    if (om !== targetModel && !om.includes(targetModel) && !targetModel.includes(om)) {
      exclusions.push({ itemId: offer.id, reason: "Different model" });
      continue;
    }
    if (Math.abs(offer.year - target.year) > yearTol) {
      exclusions.push({
        itemId: offer.id,
        reason: `Year ${offer.year} outside ±${yearTol} of target ${target.year}`,
      });
      continue;
    }
    if (
      target.mileage != null &&
      offer.mileage != null &&
      Math.abs(offer.mileage - target.mileage) > miTol
    ) {
      exclusions.push({
        itemId: offer.id,
        reason: `Mileage ${offer.mileage.toLocaleString("en-US")} outside ±${miTol.toLocaleString("en-US")} of target`,
      });
      continue;
    }
    if (offer.price <= 0) {
      exclusions.push({ itemId: offer.id, reason: "Missing or invalid price" });
      continue;
    }
    included.push(offer);
  }

  const observations: PriceObservation[] = included.map((o) => ({
    id: `obs-${o.id}`,
    sourceId: o.source.id,
    offerId: o.id,
    price: o.price,
    observedAt: o.source.retrievedAt,
    currency: "USD" as const,
    condition: o.condition,
    location: o.location,
    mileage: o.mileage,
    year: o.year,
    trim: o.trim,
  }));

  const prices = observations.map((o) => o.price);
  const missingTrimCount = included.filter((o) => !o.trim).length;
  const { confidence, confidenceScore } = scoreConfidence(
    included.length,
    missingTrimCount,
  );

  return {
    targetId: target.id,
    included,
    observations,
    median: percentileValue(prices, 50),
    p25: percentileValue(prices, 25),
    p75: percentileValue(prices, 75),
    mean:
      prices.length === 0
        ? null
        : Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
    sampleSize: prices.length,
    confidence,
    confidenceScore,
    exclusions,
    missingTrimCount,
  };
}

export function scoreConfidence(
  sampleSize: number,
  missingTrimCount: number,
): { confidence: ConfidenceLabel; confidenceScore: number } {
  let score = 0;
  if (sampleSize >= 12) score += 0.55;
  else if (sampleSize >= 8) score += 0.4;
  else if (sampleSize >= 5) score += 0.25;
  else if (sampleSize >= 1) score += 0.1;

  if (sampleSize > 0) {
    const trimComplete = 1 - missingTrimCount / sampleSize;
    score += 0.35 * trimComplete;
  }
  score += 0.1; // baseline for having a cited source URL on each row

  const confidenceScore = Math.max(0, Math.min(1, score));
  let confidence: ConfidenceLabel = "LOW";
  if (confidenceScore >= 0.7) confidence = "HIGH";
  else if (confidenceScore >= 0.45) confidence = "MEDIUM";
  return { confidence, confidenceScore };
}

/** Infer a rough trim token from a listing title when present. */
export function inferTrim(title: string, model: string): string | undefined {
  const cleaned = title.replace(new RegExp(model, "ig"), " ");
  const m = cleaned.match(
    /\b(LX|EX|EX-L|Sport|Touring|SE|SEL|XLE|XSE|Limited|Premium|Base|S|SV|SL|TRD|AT4|Denali)\b/i,
  );
  return m ? m[1] : undefined;
}

export function enrichTrim(offer: NormalizedOffer): NormalizedOffer {
  if (offer.trim) return offer;
  const trim = inferTrim(offer.title, offer.model);
  return trim ? { ...offer, trim } : offer;
}
