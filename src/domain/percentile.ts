/**
 * Where does a quote land inside a sample of market prices?
 *
 * Uses the mid-rank convention so ties are handled symmetrically:
 *   rank = (values strictly below + half of values equal) / n
 * A quote below every sample point is 0, above every point is 100.
 *
 * Returns `null` for an empty sample — the caller decides what
 * "not enough data" means (see MIN_SAMPLE_SIZE in verdict.ts);
 * this function never guesses.
 */
export function percentileRank(values: readonly number[], x: number): number | null {
  if (values.length === 0) return null;
  let below = 0;
  let equal = 0;
  for (const v of values) {
    if (v < x) below += 1;
    else if (v === x) equal += 1;
  }
  return ((below + equal / 2) / values.length) * 100;
}

/**
 * The p-th percentile (0–100) of a sample, by linear interpolation
 * between closest ranks. Returns `null` for an empty sample.
 */
export function percentileValue(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const clamped = Math.min(100, Math.max(0, p));
  const pos = (clamped / 100) * (sorted.length - 1);
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  const lowerValue = sorted[lower]!;
  const upperValue = sorted[upper]!;
  return lowerValue + (upperValue - lowerValue) * (pos - lower);
}
