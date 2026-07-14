import { describe, expect, test } from "vitest";
import { percentileRank, percentileValue } from "./percentile";

describe("percentileRank", () => {
  test("returns null for an empty sample — never guesses", () => {
    expect(percentileRank([], 100)).toBeNull();
  });

  test("single point: below, equal, above", () => {
    expect(percentileRank([100], 50)).toBe(0);
    expect(percentileRank([100], 100)).toBe(50); // mid-rank on a tie
    expect(percentileRank([100], 150)).toBe(100);
  });

  test("value below every sample point is 0, above is 100", () => {
    const prices = [10, 20, 30, 40];
    expect(percentileRank(prices, 5)).toBe(0);
    expect(percentileRank(prices, 45)).toBe(100);
  });

  test("mid-rank handles ties symmetrically", () => {
    // 1 below, 2 equal out of 4 → (1 + 1) / 4 = 50
    expect(percentileRank([10, 20, 20, 30], 20)).toBe(50);
    // all values tied → always 50, regardless of sample size
    expect(percentileRank([7, 7, 7], 7)).toBe(50);
  });

  test("does not require sorted input", () => {
    expect(percentileRank([30, 10, 40, 20], 25)).toBe(50);
  });
});

describe("percentileValue", () => {
  test("returns null for an empty sample", () => {
    expect(percentileValue([], 50)).toBeNull();
  });

  test("single point: every percentile is that point", () => {
    expect(percentileValue([42], 0)).toBe(42);
    expect(percentileValue([42], 50)).toBe(42);
    expect(percentileValue([42], 100)).toBe(42);
  });

  test("interpolates linearly between closest ranks", () => {
    expect(percentileValue([10, 20, 30, 40], 50)).toBe(25);
    expect(percentileValue([0, 100], 25)).toBe(25);
  });

  test("clamps p outside [0, 100]", () => {
    expect(percentileValue([10, 20], -5)).toBe(10);
    expect(percentileValue([10, 20], 105)).toBe(20);
  });
});
