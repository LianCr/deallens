import { describe, expect, test } from "vitest";
import { focusDomain } from "./focusDomain";

describe("focusDomain", () => {
  test("returns null for an empty series", () => {
    expect(focusDomain([])).toBeNull();
  });

  test("pads the data range by padRatio", () => {
    // range 100, pad = max(100 * 0.18, 200 * 0.04) = 18
    const [lo, hi] = focusDomain([100, 200])!;
    expect(lo).toBeCloseTo(82);
    expect(hi).toBeCloseTo(218);
  });

  test("nearly-constant series still gets a visible pad", () => {
    // range 0 → pad falls back to max * minPadFraction
    const [lo, hi] = focusDomain([50_000, 50_000])!;
    expect(hi - lo).toBeGreaterThan(0);
    expect(lo).toBeLessThan(50_000);
    expect(hi).toBeGreaterThan(50_000);
  });

  test("single point behaves like a constant series", () => {
    const [lo, hi] = focusDomain([25_000])!;
    expect(lo).toBeLessThan(25_000);
    expect(hi).toBeGreaterThan(25_000);
  });

  test("lower bound is clamped at the floor (prices are never negative)", () => {
    const [lo] = focusDomain([1, 1000])!;
    expect(lo).toBe(0);
  });

  test("does not require sorted input", () => {
    expect(focusDomain([200, 100])).toEqual(focusDomain([100, 200]));
  });
});
