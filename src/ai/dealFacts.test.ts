import { describe, expect, it } from "vitest";
import { buildDealFacts, factsBlock, type DealFactsInput } from "./dealFacts";

const baseInput: DealFactsInput = {
  vehicleName: "2022 Honda Civic",
  quote: 24500,
  verdict: "FAIR",
  percentile: 47.3,
  p25: 23100.6,
  median: 24680.2,
  p75: 26200.9,
  history: [
    { month: "2024-08", price: 26100.4 },
    { month: "2024-12", price: 25400 },
    { month: "2025-03", price: 24100.8 },
    { month: "2026-07", price: 24700 },
  ],
  events: [
    { month: "2024-09", title: "2025 model year arrives", kind: "MODEL_YEAR" },
    { month: "2024-12", title: "Year-end clearance", kind: "SEASONAL" },
  ],
  dataSource: "DEMO",
  fuel: { annualCost: 1234.4, combinedMpg: 35, milesPerYear: 12000, dollarsPerGallon: 3.6 },
};

describe("buildDealFacts", () => {
  it("compresses the server-computed context into rounded facts", () => {
    const facts = buildDealFacts(baseInput);
    expect(facts.insufficientData).toBe(false);
    expect(facts.quoteDollars).toBe(24500);
    expect(facts.medianDollars).toBe(24680);
    expect(facts.deltaFromMedianDollars).toBe(24500 - 24680.2 < 0 ? -180 : 180);
    expect(facts.percentile).toBe(47);
    expect(facts.annualFuel?.costDollars).toBe(1234);
    expect(facts.pricingDataSource).toBe("DEMO");
  });

  it("summarizes the price trend from first to last month with extremes", () => {
    const trend = buildDealFacts(baseInput).trend24Months;
    expect(trend).not.toBeNull();
    expect(trend?.startMonth).toBe("2024-08");
    expect(trend?.endMonth).toBe("2026-07");
    expect(trend?.changeDollars).toBe(Math.round(24700 - 26100.4));
    expect(trend?.changePercent).toBeCloseTo(-5.4, 1);
    expect(trend?.lowest.month).toBe("2025-03");
    expect(trend?.highest.month).toBe("2024-08");
  });

  it("flags insufficient data and withholds market numbers", () => {
    const facts = buildDealFacts({
      ...baseInput,
      verdict: "INSUFFICIENT_DATA",
      percentile: null,
      p25: null,
      median: null,
      p75: null,
      history: [],
      events: [],
    });
    expect(facts.insufficientData).toBe(true);
    expect(facts.medianDollars).toBeNull();
    expect(facts.deltaFromMedianDollars).toBeNull();
    expect(facts.trend24Months).toBeNull();
  });

  it("treats a null median as insufficient even when the verdict disagrees", () => {
    const facts = buildDealFacts({ ...baseInput, median: null });
    expect(facts.insufficientData).toBe(true);
    expect(facts.trend24Months).toBeNull();
  });

  it("handles a missing fuel record with an honest null", () => {
    expect(buildDealFacts({ ...baseInput, fuel: null }).annualFuel).toBeNull();
  });

  it("caps events to keep the facts block compact", () => {
    const manyEvents = Array.from({ length: 20 }, (_, i) => ({
      month: `2025-${String((i % 12) + 1).padStart(2, "0")}`,
      title: `Event ${i}`,
      kind: "SEASONAL" as const,
    }));
    const facts = buildDealFacts({ ...baseInput, events: manyEvents });
    expect(facts.marketEvents).toHaveLength(8);
  });

  it("carries the shopper's negotiation target as exactly one extra FACTS line", () => {
    const withTarget = buildDealFacts({ ...baseInput, target: 23950.4 });
    expect(withTarget.targetPriceDollars).toBe(23950);

    const without = buildDealFacts(baseInput);
    expect("targetPriceDollars" in without).toBe(false);
    expect(factsBlock(withTarget).split("\n")).toHaveLength(
      factsBlock(without).split("\n").length + 1,
    );
  });

  it("treats an explicit null target the same as an absent one", () => {
    expect("targetPriceDollars" in buildDealFacts({ ...baseInput, target: null })).toBe(
      false,
    );
  });

  it("is deterministic: the FACTS block is a stable snapshot", () => {
    expect(factsBlock(buildDealFacts(baseInput))).toMatchSnapshot();
  });
});
