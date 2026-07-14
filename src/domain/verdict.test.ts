import { describe, expect, test } from "vitest";
import { assessDeal, MIN_SAMPLE_SIZE } from "./verdict";

/** Evenly spread market: percentileRank(quote) is easy to reason about. */
const market = [20_000, 21_000, 22_000, 23_000, 24_000, 25_000, 26_000, 27_000];

describe("assessDeal", () => {
  test("refuses to judge below the minimum sample size", () => {
    const thin = market.slice(0, MIN_SAMPLE_SIZE - 1);
    expect(assessDeal(22_000, thin)).toEqual({
      verdict: "INSUFFICIENT_DATA",
      percentile: null,
    });
    expect(assessDeal(22_000, [])).toEqual({
      verdict: "INSUFFICIENT_DATA",
      percentile: null,
    });
  });

  test("quote cheaper than the whole market is a great deal at percentile 0", () => {
    expect(assessDeal(15_000, market)).toEqual({
      verdict: "GREAT_DEAL",
      percentile: 0,
    });
  });

  test("boundary: exactly the 25th percentile is still a great deal", () => {
    // 2 of 8 below → mid-rank 25 with a tiny epsilon below the tie
    const { verdict, percentile } = assessDeal(21_500, market);
    expect(percentile).toBe(25);
    expect(verdict).toBe("GREAT_DEAL");
  });

  test("mid-market quote is fair", () => {
    const { verdict, percentile } = assessDeal(23_500, market);
    expect(percentile).toBe(50);
    expect(verdict).toBe("FAIR");
  });

  test("boundary: exactly the 75th percentile is still fair", () => {
    const { verdict, percentile } = assessDeal(25_500, market);
    expect(percentile).toBe(75);
    expect(verdict).toBe("FAIR");
  });

  test("quote above the whole market is above market at percentile 100", () => {
    expect(assessDeal(30_000, market)).toEqual({
      verdict: "ABOVE_MARKET",
      percentile: 100,
    });
  });
});
