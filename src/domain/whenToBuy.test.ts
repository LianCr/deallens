import { describe, expect, test } from "vitest";
import { whenToBuy } from "./whenToBuy";
import type { PricePoint } from "./types";

/** 12 consecutive months starting Jan 2025 at a flat base price. */
function flatYear(base: number, startYear = 2025): PricePoint[] {
  return Array.from({ length: 12 }, (_, i) => ({
    month: `${startYear}-${String(i + 1).padStart(2, "0")}`,
    price: base,
  }));
}

describe("whenToBuy", () => {
  test("null for an empty history", () => {
    expect(whenToBuy([])).toBeNull();
  });

  test("null for a thin market (3 points)", () => {
    const thin: PricePoint[] = [
      { month: "2025-04", price: 20_000 },
      { month: "2025-05", price: 19_000 },
      { month: "2025-06", price: 21_000 },
    ];
    expect(whenToBuy(thin)).toBeNull();
  });

  test("null at 11 distinct calendar months, even across two years", () => {
    // Jan–Nov 2024 plus Jan–Nov 2025: 22 points, 11 distinct months.
    const points = [...flatYear(20_000, 2024).slice(0, 11), ...flatYear(20_000, 2025).slice(0, 11)];
    points[0] = { ...points[0]!, price: 15_000 }; // deep dip, still too thin
    expect(whenToBuy(points)).toBeNull();
  });

  test("exactly 12 distinct months is enough", () => {
    const points = flatYear(20_000);
    points[11] = { month: "2025-12", price: 18_000 }; // 10% dip
    const hint = whenToBuy(points);
    expect(hint).not.toBeNull();
    expect(hint!.monthName).toBe("December");
  });

  test("a clear seasonal dip: month name and percentage are exact", () => {
    // 11 months at 20k, December at 14k.
    // Overall mean = (11 * 20000 + 14000) / 12 = 19500.
    // Below-average = (19500 - 14000) / 19500 = 28.2051...%
    const points = flatYear(20_000);
    points[11] = { month: "2025-12", price: 14_000 };
    const hint = whenToBuy(points);
    expect(hint!.monthName).toBe("December");
    expect(hint!.belowAveragePct).toBeCloseTo((5500 / 19500) * 100, 10);
  });

  test("aggregates the same calendar month across years by mean", () => {
    // Two full years. December is 16k one year and 18k the next
    // (mean 17k); March is 16.5k both years (mean 16.5k) — March
    // wins even though December holds the single lowest point.
    const points = [...flatYear(20_000, 2024), ...flatYear(20_000, 2025)];
    points[11] = { month: "2024-12", price: 16_000 };
    points[23] = { month: "2025-12", price: 18_000 };
    points[2] = { month: "2024-03", price: 16_500 };
    points[14] = { month: "2025-03", price: 16_500 };
    expect(whenToBuy(points)!.monthName).toBe("March");
  });

  test("tie between months: the earliest calendar month wins", () => {
    const points = flatYear(20_000);
    points[3] = { month: "2025-04", price: 17_000 };
    points[9] = { month: "2025-10", price: 17_000 };
    expect(whenToBuy(points)!.monthName).toBe("April");
  });

  test("sub-1% dip is noise, not a season: null", () => {
    // 11 months at 20000, one month at 19900.
    // Overall mean = 19991.67; margin = 0.4585% < 1%.
    const points = flatYear(20_000);
    points[7] = { month: "2025-08", price: 19_900 };
    expect(whenToBuy(points)).toBeNull();
  });

  test("a dip at exactly the 1% threshold is reported (>= gate)", () => {
    // Integer-exact construction: ten months at 20000, November at
    // 20200, December at 19800. Total = 240000 → overall mean = 20000.
    // Margin = (20000 - 19800) / 20000 = exactly 1%.
    const points = flatYear(20_000);
    points[10] = { month: "2025-11", price: 20_200 };
    points[11] = { month: "2025-12", price: 19_800 };
    const hint = whenToBuy(points);
    expect(hint).not.toBeNull();
    expect(hint!.monthName).toBe("December");
    expect(hint!.belowAveragePct).toBeCloseTo(1, 9);
  });

  test("flat prices produce no hint (0% margin)", () => {
    expect(whenToBuy(flatYear(20_000))).toBeNull();
  });

  test("malformed month keys and non-finite prices are skipped, not guessed", () => {
    const points = flatYear(20_000);
    points[5] = { month: "2025-06", price: 15_000 };
    const noisy: PricePoint[] = [
      ...points,
      { month: "garbage", price: 1 },
      { month: "2025-13", price: 1 },
      { month: "2025-00", price: 1 },
      { month: "2025-07", price: NaN },
      { month: "2025-07", price: Infinity },
    ];
    const hint = whenToBuy(noisy);
    expect(hint).toEqual(whenToBuy(points));
    expect(hint!.monthName).toBe("June");
  });

  test("is a pure function: same input, same output, input untouched", () => {
    const points = flatYear(20_000);
    points[11] = { month: "2025-12", price: 18_000 };
    const frozen = points.map((p) => Object.freeze({ ...p }));
    const a = whenToBuy(frozen);
    const b = whenToBuy(frozen);
    expect(a).toEqual(b);
    expect(frozen[11]!.price).toBe(18_000);
  });

  test("24-month generator-shaped history with a late-summer dip", () => {
    // Mirrors pricing-gen: 24 consecutive months, mild drift, a dip in
    // August/September. The dip month must surface with a >1% margin.
    const points: PricePoint[] = [];
    for (let i = 0; i < 24; i++) {
      const year = 2024 + Math.floor(i / 12);
      const m = (i % 12) + 1;
      const seasonal = m === 8 || m === 9 ? 0.94 : 1;
      points.push({
        month: `${year}-${String(m).padStart(2, "0")}`,
        price: Math.round(25_000 * seasonal),
      });
    }
    const hint = whenToBuy(points);
    expect(hint).not.toBeNull();
    expect(["August", "September"]).toContain(hint!.monthName);
    expect(hint!.belowAveragePct).toBeGreaterThan(1);
  });
});
