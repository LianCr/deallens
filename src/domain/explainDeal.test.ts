import { describe, expect, test } from "vitest";
import { explainDeal } from "./explainDeal";
import { assessDeal } from "./verdict";

/** 21 evenly spread prices: median 25,000. */
const market = Array.from({ length: 21 }, (_, i) => 20_000 + i * 500);

describe("explainDeal", () => {
  test("matches assessDeal for every quote in a thick market", () => {
    for (const quote of [15_000, 20_000, 22_500, 25_000, 27_500, 30_000, 40_000]) {
      const explanation = explainDeal(quote, market);
      expect(explanation.assessment).toEqual(assessDeal(quote, market));
      expect(explanation.percentile).toBe(explanation.assessment.percentile);
      expect(explanation.sufficient).toBe(true);
      expect(explanation.sampleSize).toBe(21);
      expect(explanation.p25).not.toBeNull();
      expect(explanation.median).not.toBeNull();
      expect(explanation.p75).not.toBeNull();
    }
  });

  test("empty sample → insufficient, no quartiles, band NONE", () => {
    const explanation = explainDeal(22_000, []);
    expect(explanation.assessment).toEqual({
      verdict: "INSUFFICIENT_DATA",
      percentile: null,
    });
    expect(explanation.sufficient).toBe(false);
    expect(explanation.band).toBe("NONE");
    expect(explanation.p25).toBeNull();
    expect(explanation.steps.some((s) => /refuse|Too thin|Not computed/i.test(s.detail))).toBe(
      true,
    );
  });

  test("thin sample below MIN_SAMPLE_SIZE → insufficient", () => {
    const thin = [20_000, 21_000, 22_000];
    const explanation = explainDeal(21_000, thin);
    expect(explanation.assessment.verdict).toBe("INSUFFICIENT_DATA");
    expect(explanation.sufficient).toBe(false);
    expect(explanation.band).toBe("NONE");
    expect(explanation.summary).toMatch(/insufficient/i);
  });

  test("boundary at P25 lands in GREAT band", () => {
    // Force a quote at or below the 25th percentile of `market`.
    const explanation = explainDeal(20_000, market);
    expect(explanation.assessment.verdict).toBe("GREAT_DEAL");
    expect(explanation.band).toBe("GREAT");
    expect(explanation.summary).toMatch(/Great/i);
  });

  test("quote near median lands in FAIR band", () => {
    const explanation = explainDeal(25_000, market);
    expect(explanation.assessment.verdict).toBe("FAIR");
    expect(explanation.band).toBe("FAIR");
  });

  test("high quote lands in ABOVE band", () => {
    const explanation = explainDeal(35_000, market);
    expect(explanation.assessment.verdict).toBe("ABOVE_MARKET");
    expect(explanation.band).toBe("ABOVE");
  });

  test("steps are ordered and include thresholds", () => {
    const explanation = explainDeal(24_500, market);
    expect(explanation.steps.map((s) => s.id)).toEqual([
      "sample",
      "quartiles",
      "percentile",
      "thresholds",
      "outcome",
    ]);
    expect(explanation.steps.find((s) => s.id === "thresholds")?.detail).toMatch(/P25/);
  });

  test("tied prices still produce a percentile (mid-rank)", () => {
    const tied = [10_000, 10_000, 10_000, 10_000, 10_000, 10_000, 10_000, 20_000];
    const explanation = explainDeal(10_000, tied);
    expect(explanation.sufficient).toBe(true);
    expect(explanation.percentile).not.toBeNull();
    expect(explanation.assessment).toEqual(assessDeal(10_000, tied));
  });
});
