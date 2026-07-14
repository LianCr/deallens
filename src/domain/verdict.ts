import type { Verdict } from "./types";
import { percentileRank } from "./percentile";

/**
 * Below this many comparable listings we refuse to compute a percentile.
 * A verdict drawn from a handful of points would be noise dressed up as
 * confidence — we return INSUFFICIENT_DATA instead of guessing.
 */
export const MIN_SAMPLE_SIZE = 8;

/** Quote at or below the 25th percentile of market prices. */
export const GREAT_DEAL_MAX_PERCENTILE = 25;
/** Quote at or below the 75th percentile; above that is above market. */
export const FAIR_MAX_PERCENTILE = 75;

export interface DealAssessment {
  verdict: Verdict;
  /** null when the sample is too small to be honest about. */
  percentile: number | null;
}

/**
 * Turn a dealer quote + a sample of market prices into a verdict.
 * Lower percentile = cheaper than more of the market = better for the buyer.
 */
export function assessDeal(
  quote: number,
  marketPrices: readonly number[],
): DealAssessment {
  if (marketPrices.length < MIN_SAMPLE_SIZE) {
    return { verdict: "INSUFFICIENT_DATA", percentile: null };
  }
  const percentile = percentileRank(marketPrices, quote);
  // percentileRank only returns null on an empty sample, which the
  // MIN_SAMPLE_SIZE guard above already excludes.
  if (percentile === null) {
    return { verdict: "INSUFFICIENT_DATA", percentile: null };
  }
  if (percentile <= GREAT_DEAL_MAX_PERCENTILE) {
    return { verdict: "GREAT_DEAL", percentile };
  }
  if (percentile <= FAIR_MAX_PERCENTILE) {
    return { verdict: "FAIR", percentile };
  }
  return { verdict: "ABOVE_MARKET", percentile };
}
