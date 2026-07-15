import { describe, expect, test } from "vitest";
import { assessDeal } from "@/domain/verdict";
import { percentileRank, percentileValue } from "@/domain/percentile";
import {
  counterOffers,
  floorToStep,
  priceAtOrBelowPercentile,
  QUOTE_STEP,
  roundToStep,
  snapDetents,
  snapToDetent,
  zoneStops,
} from "./explorerMath";

/** 21 evenly spread prices: P25 = 22,500, median = 25,000, P75 = 27,500. */
const samples = Array.from({ length: 21 }, (_, i) => 20_000 + i * 500);

describe("step rounding", () => {
  test("floors and rounds to the $50 haggling step", () => {
    expect(floorToStep(22_549)).toBe(22_500);
    expect(floorToStep(22_500)).toBe(22_500);
    expect(roundToStep(22_526)).toBe(22_550);
    expect(roundToStep(22_524)).toBe(22_500);
  });

  test("never rounds below one step", () => {
    expect(floorToStep(3)).toBe(QUOTE_STEP);
    expect(roundToStep(-100)).toBe(QUOTE_STEP);
  });
});

describe("zoneStops", () => {
  test("maps the quartiles to percent stops of the slider span", () => {
    expect(zoneStops(25, 75, 0, 100)).toEqual({ greatEndPct: 25, fairEndPct: 75 });
    expect(zoneStops(22_500, 27_500, 19_200, 30_800)).toEqual({
      greatEndPct: ((22_500 - 19_200) / 11_600) * 100,
      fairEndPct: ((27_500 - 19_200) / 11_600) * 100,
    });
  });

  test("clamps quartiles that fall outside the slider range", () => {
    expect(zoneStops(-10, 50, 0, 100)).toEqual({ greatEndPct: 0, fairEndPct: 50 });
    expect(zoneStops(50, 250, 0, 100)).toEqual({ greatEndPct: 50, fairEndPct: 100 });
  });

  test("keeps the stops ordered even on degenerate input", () => {
    const stops = zoneStops(80, 20, 0, 100);
    expect(stops).not.toBeNull();
    expect(stops!.fairEndPct).toBeGreaterThanOrEqual(stops!.greatEndPct);
  });

  test("refuses a zero or negative span", () => {
    expect(zoneStops(25, 75, 100, 100)).toBeNull();
    expect(zoneStops(25, 75, 100, 50)).toBeNull();
  });
});

describe("snapDetents", () => {
  test("returns the quartiles rounded to the $50 step", () => {
    expect(snapDetents(samples)).toEqual({ p25: 22_500, median: 25_000, p75: 27_500 });
  });

  test("returns null for an empty sample", () => {
    expect(snapDetents([])).toBeNull();
  });
});

describe("snapToDetent", () => {
  const detents = [22_500, 25_000, 27_500];
  // Span 19,200–30,800 → snap radius 1.5% × 11,600 = 174.
  const min = 19_200;
  const max = 30_800;

  test("snaps within 1.5% of the span, to the nearest detent", () => {
    expect(snapToDetent(22_400, detents, min, max)).toBe(22_500);
    expect(snapToDetent(25_150, detents, min, max)).toBe(25_000);
  });

  test("leaves values outside the radius alone", () => {
    expect(snapToDetent(22_300, detents, min, max)).toBe(22_300);
    expect(snapToDetent(30_000, detents, min, max)).toBe(30_000);
  });
});

describe("priceAtOrBelowPercentile", () => {
  test("the aggressive chip boundary: floored P25 must be GREAT_DEAL", () => {
    const aggressive = priceAtOrBelowPercentile(samples, 25)!;
    expect(assessDeal(aggressive, samples).verdict).toBe("GREAT_DEAL");
    // Which naive flooring alone does NOT guarantee here: P25 lands
    // exactly on a sample, and the mid-rank tie pushes it past 25.
    expect(assessDeal(floorToStep(percentileValue(samples, 25)!), samples).verdict).toBe(
      "FAIR",
    );
    expect(aggressive).toBe(22_450);
  });

  test("the balanced chip sits at or below the 40th percentile", () => {
    const balanced = priceAtOrBelowPercentile(samples, 40)!;
    expect(percentileRank(samples, balanced)!).toBeLessThanOrEqual(40);
    expect(assessDeal(balanced, samples).verdict).toBe("FAIR");
    expect(balanced).toBe(23_950);
  });

  test("the walk-away chip sits at or below the median", () => {
    const walkaway = priceAtOrBelowPercentile(samples, 50)!;
    expect(percentileRank(samples, walkaway)!).toBeLessThanOrEqual(50);
    expect(walkaway).toBe(25_000);
  });

  test("steps down through heavy ties until the rank agrees", () => {
    const tied = [
      20_000, 22_000, 22_000, 22_000, 22_000, 22_000, 22_000, 22_000, 24_000, 26_000,
    ];
    const price = priceAtOrBelowPercentile(tied, 25)!;
    expect(percentileRank(tied, price)!).toBeLessThanOrEqual(25);
  });

  test("returns null for an empty sample", () => {
    expect(priceAtOrBelowPercentile([], 25)).toBeNull();
  });
});

describe("counterOffers", () => {
  test("returns the three chips with honest grounding lines", () => {
    const offers = counterOffers(samples)!;
    expect(offers.map((offer) => offer.id)).toEqual([
      "aggressive",
      "balanced",
      "walkaway",
    ]);
    expect(offers.map((offer) => offer.value)).toEqual([22_450, 23_950, 25_000]);
    for (const offer of offers) {
      expect(offer.grounding.length).toBeGreaterThan(0);
      expect(offer.value % QUOTE_STEP).toBe(0);
    }
  });

  test("returns null when there is no market to ground them in", () => {
    expect(counterOffers([])).toBeNull();
  });
});
