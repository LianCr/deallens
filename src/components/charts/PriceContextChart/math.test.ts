import { describe, expect, test } from "vitest";
import type { PriceBucket } from "@/domain/types";
import { buildDistributionShape, percentileFromBuckets } from "./math";

const buckets: PriceBucket[] = [
  { lo: 100, hi: 200, count: 10 },
  { lo: 200, hi: 300, count: 30 },
  { lo: 300, hi: 400, count: 10 },
];

describe("buildDistributionShape", () => {
  test("returns null for empty buckets", () => {
    expect(buildDistributionShape([])).toBeNull();
  });

  test("x scale spans the full bucket range", () => {
    const shape = buildDistributionShape(buckets)!;
    expect(shape.x.domain()).toEqual([100, 400]);
  });

  test("produces non-empty svg paths", () => {
    const shape = buildDistributionShape(buckets)!;
    expect(shape.areaPath.length).toBeGreaterThan(0);
    expect(shape.linePath.startsWith("M")).toBe(true);
  });
});

describe("percentileFromBuckets", () => {
  test("null for an empty distribution", () => {
    expect(percentileFromBuckets([], 100)).toBeNull();
  });

  test("clamps at the domain edges", () => {
    expect(percentileFromBuckets(buckets, 50)).toBe(0);
    expect(percentileFromBuckets(buckets, 500)).toBe(100);
  });

  test("accumulates whole buckets below the price", () => {
    // Price at 300: buckets 1+2 fully below → 40/50 = 80%.
    expect(percentileFromBuckets(buckets, 300)).toBe(80);
  });

  test("interpolates inside a bucket", () => {
    // Price 250: bucket 1 (10) + half of bucket 2 (15) → 25/50 = 50%.
    expect(percentileFromBuckets(buckets, 250)).toBe(50);
  });
});
