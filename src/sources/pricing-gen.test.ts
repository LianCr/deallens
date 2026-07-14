import { describe, expect, test } from "vitest";
import { generatePricingDataset } from "./pricing-gen";

const AS_OF = "2026-07";

describe("generatePricingDataset", () => {
  test("is deterministic: same vehicle, same market — always", () => {
    const a = generatePricingDataset("Honda", "Civic", 2022, AS_OF);
    const b = generatePricingDataset("Honda", "Civic", 2022, AS_OF);
    expect(a).toEqual(b);
  });

  test("case-insensitive on make/model identity", () => {
    const a = generatePricingDataset("Honda", "Civic", 2022, AS_OF);
    const b = generatePricingDataset("HONDA", "civic", 2022, AS_OF);
    expect(a).toEqual(b);
  });

  test("different vehicles get different markets", () => {
    const civic = generatePricingDataset("Honda", "Civic", 2022, AS_OF);
    const accord = generatePricingDataset("Honda", "Accord", 2022, AS_OF);
    expect(civic.listings).not.toEqual(accord.listings);
  });

  test("every dataset is tagged DEMO — honesty is not optional", () => {
    expect(generatePricingDataset("Honda", "Civic", 2022, AS_OF).dataSource).toBe(
      "DEMO",
    );
  });

  test("history covers 24 months ending at asOf, oldest first", () => {
    const { history } = generatePricingDataset("Honda", "Civic", 2022, AS_OF);
    expect(history).toHaveLength(24);
    expect(history.at(-1)!.month).toBe(AS_OF);
    expect(history[0]!.month).toBe("2024-08");
    const months = history.map((p) => p.month);
    expect([...months].sort()).toEqual(months);
  });

  test("prices are plausible dollar amounts", () => {
    const { listings, history } = generatePricingDataset(
      "Honda",
      "Civic",
      2022,
      AS_OF,
    );
    for (const price of [...listings, ...history.map((p) => p.price)]) {
      expect(price).toBeGreaterThan(3_000);
      expect(price).toBeLessThan(80_000);
      expect(Number.isInteger(price)).toBe(true);
    }
  });

  test("older vehicles are cheaper than their newer selves", () => {
    const newer = generatePricingDataset("Honda", "Civic", 2024, AS_OF);
    const older = generatePricingDataset("Honda", "Civic", 2024, "2028-07");
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
    expect(median(older.listings)).toBeLessThan(median(newer.listings));
  });

  test("events land inside the 24-month history window", () => {
    const { events, history } = generatePricingDataset("Honda", "Civic", 2022, AS_OF);
    const first = history[0]!.month;
    const last = history.at(-1)!.month;
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.month >= first).toBe(true);
      expect(event.month <= last).toBe(true);
    }
    // September model-year arrivals and March tax-season events recur.
    expect(events.some((e) => e.kind === "MODEL_YEAR")).toBe(true);
    expect(events.some((e) => e.kind === "SEASONAL")).toBe(true);
  });

  test("some vehicles get an honestly thin market (INSUFFICIENT_DATA showcase)", () => {
    // Scan a deterministic space of vehicles; the ~5% thin-market rule
    // must produce at least one, and thin means BOTH too few listings
    // and too little history.
    const vehicles = Array.from({ length: 200 }, (_, i) =>
      generatePricingDataset("Testmake", `Model${i}`, 2020, AS_OF),
    );
    const thin = vehicles.filter((v) => v.listings.length < 8);
    expect(thin.length).toBeGreaterThan(0);
    for (const dataset of thin) {
      expect(dataset.history.length).toBeLessThan(24);
      expect(dataset.events).toEqual([]);
    }
  });
});
