import { describe, expect, test } from "vitest";
import { buildHistogram } from "./histogram";

describe("buildHistogram", () => {
  test("empty input produces no buckets", () => {
    expect(buildHistogram([])).toEqual([]);
  });

  test("all-identical values collapse to a single bucket", () => {
    expect(buildHistogram([5, 5, 5])).toEqual([{ lo: 5, hi: 5, count: 3 }]);
  });

  test("counts every value exactly once, including the max", () => {
    const values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const buckets = buildHistogram(values, 5);
    const total = buckets.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(values.length);
    // The max value (10) must land in the last bucket, not overflow.
    expect(buckets.at(-1)!.count).toBeGreaterThan(0);
  });

  test("buckets tile the full range with equal widths", () => {
    const buckets = buildHistogram([0, 100], 4);
    expect(buckets[0]).toMatchObject({ lo: 0, hi: 25 });
    expect(buckets.at(-1)).toMatchObject({ lo: 75, hi: 100 });
  });
});
