/**
 * When is this market cheapest? Aggregates price history by calendar
 * month (all Januaries together, all Februaries together, …), finds the
 * month with the lowest mean price, and reports how far it sits below
 * the overall mean.
 *
 * Honesty rules — return `null` rather than guess when:
 *  - fewer than 12 distinct calendar months are covered (a partial year
 *    can't support a seasonal claim), or
 *  - the cheapest month is less than 1% below the overall mean (that's
 *    noise, not a season).
 *
 * Tie-break: if two calendar months share the exact lowest mean, the
 * earliest in the calendar year wins (January before December). The
 * rule is arbitrary but deterministic — same input, same answer.
 *
 * Pure function, zero dependencies, never reads the clock.
 */
import type { PricePoint } from "./types";

export interface WhenToBuyHint {
  /** English name of the cheapest calendar month, e.g. "December". */
  monthName: string;
  /** How far its mean sits below the overall mean, in percent (> 0). */
  belowAveragePct: number;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Below-average margin under this is noise, not a signal. */
const MIN_SIGNAL_PCT = 1;
/** A seasonal claim needs the whole calendar covered. */
const MIN_DISTINCT_MONTHS = 12;

export function whenToBuy(history: readonly PricePoint[]): WhenToBuyHint | null {
  // sums[m] / counts[m] accumulate per calendar month, index 0 = January.
  const sums = new Array<number>(12).fill(0);
  const counts = new Array<number>(12).fill(0);
  let total = 0;
  let n = 0;

  for (const point of history) {
    // "YYYY-MM" → calendar month 1–12. Malformed keys or non-finite
    // prices are skipped, never guessed at.
    const monthPart = Number(point.month.slice(5, 7));
    if (!Number.isInteger(monthPart) || monthPart < 1 || monthPart > 12) continue;
    if (!Number.isFinite(point.price)) continue;
    sums[monthPart - 1]! += point.price;
    counts[monthPart - 1]! += 1;
    total += point.price;
    n += 1;
  }

  const distinctMonths = counts.filter((c) => c > 0).length;
  if (distinctMonths < MIN_DISTINCT_MONTHS) return null;

  const overallMean = total / n;
  if (overallMean <= 0) return null;

  // Lowest mean wins; on an exact tie the earlier calendar month wins
  // because the scan runs January → December and only strictly-lower
  // means displace the incumbent.
  let bestMonth = -1;
  let bestMean = Infinity;
  for (let m = 0; m < 12; m++) {
    if (counts[m]! === 0) continue;
    const mean = sums[m]! / counts[m]!;
    if (mean < bestMean) {
      bestMean = mean;
      bestMonth = m;
    }
  }

  const belowAveragePct = ((overallMean - bestMean) / overallMean) * 100;
  if (belowAveragePct < MIN_SIGNAL_PCT) return null;

  return { monthName: MONTH_NAMES[bestMonth]!, belowAveragePct };
}
