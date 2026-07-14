import type { PriceBucket } from "./types";

/**
 * Fixed-width histogram over a price sample, used by both the GraphQL
 * layer and the distribution chart so they can never disagree.
 *
 * Bucket bounds are half-open [lo, hi) except the last bucket, which
 * includes its upper bound so the max value is always counted.
 */
export function buildHistogram(
  values: readonly number[],
  bucketCount = 16,
): PriceBucket[] {
  if (values.length === 0 || bucketCount < 1) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) {
    return [{ lo: min, hi: max, count: values.length }];
  }
  const width = (max - min) / bucketCount;
  const buckets: PriceBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    lo: min + i * width,
    hi: min + (i + 1) * width,
    count: 0,
  }));
  for (const v of values) {
    const index = Math.min(Math.floor((v - min) / width), bucketCount - 1);
    buckets[index]!.count += 1;
  }
  return buckets;
}
