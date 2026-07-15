import { percentileRank, percentileValue } from "@/domain/percentile";

/**
 * Pure math behind the QuoteExplorer's negotiation aids: verdict zones
 * on the slider track, snap detents at the quartiles, and the three
 * counter-offer chips. Everything here reuses the same domain functions
 * the server's verdict ran (`percentileValue`, `percentileRank`) — no
 * client-side approximation of the market — and everything is
 * deterministic, so the server-rendered island and the hydrated island
 * can't disagree.
 */

/** Slider granularity — nobody haggles in sub-$50 steps. */
export const QUOTE_STEP = 50;

export const floorToStep = (value: number): number =>
  Math.max(QUOTE_STEP, Math.floor(value / QUOTE_STEP) * QUOTE_STEP);
export const ceilToStep = (value: number): number =>
  Math.ceil(value / QUOTE_STEP) * QUOTE_STEP;
export const roundToStep = (value: number): number =>
  Math.max(QUOTE_STEP, Math.round(value / QUOTE_STEP) * QUOTE_STEP);

/**
 * Where the verdict zones end on the track, as percentages of the
 * slider span: [0, greatEndPct] is the great-deal zone (quote ≤ P25),
 * (greatEndPct, fairEndPct] is fair, the rest is above market. Clamped
 * so quartiles outside the slider range never produce a broken gradient.
 * Returns null when the span is degenerate.
 */
export interface ZoneStops {
  greatEndPct: number;
  fairEndPct: number;
}

export function zoneStops(
  p25: number,
  p75: number,
  sliderMin: number,
  sliderMax: number,
): ZoneStops | null {
  const span = sliderMax - sliderMin;
  if (span <= 0) return null;
  const toPct = (value: number): number =>
    Math.min(100, Math.max(0, ((value - sliderMin) / span) * 100));
  const greatEndPct = toPct(p25);
  return { greatEndPct, fairEndPct: Math.max(greatEndPct, toPct(p75)) };
}

/**
 * The three snap detents — P25, median, P75 — each rounded to the $50
 * step so a snapped value is always a legal slider position. Null when
 * the sample is empty (the explorer is hidden then anyway).
 */
export interface SnapDetents {
  p25: number;
  median: number;
  p75: number;
}

export function snapDetents(samples: readonly number[]): SnapDetents | null {
  const p25 = percentileValue(samples, 25);
  const median = percentileValue(samples, 50);
  const p75 = percentileValue(samples, 75);
  if (p25 === null || median === null || p75 === null) return null;
  return {
    p25: roundToStep(p25),
    median: roundToStep(median),
    p75: roundToStep(p75),
  };
}

/** Soft-snap radius: 1.5% of the slider span. */
export const SNAP_SPAN_FRACTION = 0.015;

/**
 * Soft snap: if `value` lands within 1.5% of the slider span of any
 * detent, return the nearest such detent; otherwise the value as-is.
 */
export function snapToDetent(
  value: number,
  detents: readonly number[],
  sliderMin: number,
  sliderMax: number,
): number {
  const radius = (sliderMax - sliderMin) * SNAP_SPAN_FRACTION;
  let snapped = value;
  let bestDistance = Infinity;
  for (const detent of detents) {
    const distance = Math.abs(value - detent);
    if (distance <= radius && distance < bestDistance) {
      snapped = detent;
      bestDistance = distance;
    }
  }
  return snapped;
}

/**
 * The highest $50-step price whose market rank is at or below the p-th
 * percentile. Flooring the interpolated percentile value is not enough
 * on its own: when it lands exactly on a sample point, the mid-rank tie
 * convention can push the rank past p (e.g. P25 exactly on a sample →
 * rank > 25). Stepping down until the rank agrees makes the guarantee
 * unconditional — a chip's verdict can never overshoot its own claim.
 */
export function priceAtOrBelowPercentile(
  samples: readonly number[],
  p: number,
): number | null {
  const value = percentileValue(samples, p);
  if (value === null) return null;
  let candidate = floorToStep(value);
  while (candidate > QUOTE_STEP && (percentileRank(samples, candidate) ?? 0) > p) {
    candidate -= QUOTE_STEP;
  }
  return candidate;
}

export interface CounterOffer {
  id: "aggressive" | "balanced" | "walkaway";
  label: string;
  value: number;
  /** One honest line of grounding — where this number comes from. */
  grounding: string;
}

/**
 * The three counter-offer chips. Values are guaranteed at-or-below
 * their percentile (see priceAtOrBelowPercentile), so the grounding
 * lines never overstate the market position.
 */
export function counterOffers(samples: readonly number[]): CounterOffer[] | null {
  const aggressive = priceAtOrBelowPercentile(samples, 25);
  const balanced = priceAtOrBelowPercentile(samples, 40);
  const walkaway = priceAtOrBelowPercentile(samples, 50);
  if (aggressive === null || balanced === null || walkaway === null) return null;
  return [
    {
      id: "aggressive",
      label: "Aggressive",
      value: aggressive,
      grounding: "1 in 4 comparable listings closed below this",
    },
    {
      id: "balanced",
      label: "Balanced",
      value: balanced,
      grounding: "4 in 10 comparable listings closed below this",
    },
    {
      id: "walkaway",
      label: "Walk-away",
      value: walkaway,
      grounding: "Half of comparable listings closed below this",
    },
  ];
}
