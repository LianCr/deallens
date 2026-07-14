/**
 * Y-axis domain that keeps the interesting part of a price series readable.
 *
 * Ported from smart-money-decoder's GodModeTimeline: without padding, a
 * series whose values sit in a narrow band gets rendered as a flat line
 * against a zero-based axis. We zoom the axis to the data's own range,
 * padded so the line never kisses the chart edges:
 *
 *   pad = max((max - min) * padRatio, max * minPadFraction)
 *
 * The second term keeps a visible pad even when the series is nearly
 * constant (max === min). The lower bound is clamped at `floor`
 * (prices can't go below zero).
 */
export function focusDomain(
  values: readonly number[],
  {
    padRatio = 0.18,
    minPadFraction = 0.04,
    floor = 0,
  }: { padRatio?: number; minPadFraction?: number; floor?: number } = {},
): [number, number] | null {
  if (values.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const pad = Math.max((max - min) * padRatio, Math.abs(max) * minPadFraction);
  return [Math.max(floor, min - pad), max + pad];
}
